import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

// Mongo's duplicate-key error code — surfaced on MongoServerError, not on a
// Mongoose-specific class, so it's matched by code rather than instanceof.
const DUPLICATE_KEY = 11000;

type MongoServerErrorish = Error & { code?: number; keyValue?: Record<string, unknown> };

// Without a filter, anything that isn't an HttpException reaches the client as
// a bare 500 with no body — which is how an out-of-range longitude rejected by
// the 2dsphere index (`Can't extract geo keys`) became an undebuggable 500 on
// POST /owner/sourcing/businesses. Every response now carries a requestId that
// also appears in the server log line, so a report can be traced to its cause.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = randomUUID();

    const { status, body, logAsError } = this.describe(exception, requestId);
    const where = `${req.method} ${req.originalUrl}`;

    if (logAsError) {
      this.logger.error(`[${requestId}] ${where} -> ${status}`, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(`[${requestId}] ${where} -> ${status}: ${JSON.stringify(body)}`);
    }

    res.status(status).json(body);
  }

  private describe(exception: unknown, requestId: string) {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      return {
        status: exception.getStatus(),
        body: typeof payload === 'string' ? { error: payload, requestId } : { ...(payload as object), requestId },
        // 5xx thrown deliberately still deserves a stack; 4xx is expected traffic.
        logAsError: exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }

    // Schema-level rejection (min/max, required, enum) — the caller sent bad
    // data, so this is a 400 with the offending paths named, not a 500.
    if (exception instanceof mongoose.Error.ValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: 'validation_failed',
          fields: Object.fromEntries(Object.entries(exception.errors).map(([path, e]) => [path, e.message])),
          requestId,
        },
        logAsError: false,
      };
    }

    if (exception instanceof mongoose.Error.CastError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { error: 'invalid_value', field: exception.path, requestId },
        logAsError: false,
      };
    }

    const mongoErr = exception as MongoServerErrorish;

    if (mongoErr?.code === DUPLICATE_KEY) {
      return {
        status: HttpStatus.CONFLICT,
        body: { error: 'already_exists', fields: Object.keys(mongoErr.keyValue ?? {}), requestId },
        logAsError: false,
      };
    }

    // A 2dsphere index rejects out-of-range coordinates at write time. Reaching
    // this branch means a bad lat/lng slipped past DTO validation, so it is a
    // 400 for the caller but still logged as an error worth investigating.
    if (typeof mongoErr?.message === 'string' && mongoErr.message.includes("Can't extract geo keys")) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { error: 'invalid_coordinates', message: 'lat must be -90..90 and lng -180..180', requestId },
        logAsError: true,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: 'internal_error', requestId },
      logAsError: true,
    };
  }
}
