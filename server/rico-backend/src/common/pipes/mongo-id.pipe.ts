import { BadRequestException, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/// Guards an id read straight off the query string or route.
///
/// Express parses `?businessId[$ne]=x` into `{ $ne: 'x' }`, and a raw
/// `@Query('businessId')` hands that object to Mongo as an operator — so
/// `findOne({ accountId, businessId })` matches *any* business. A DTO with
/// `@IsMongoId()` covers bodies; this covers the single-value params that
/// never had a DTO.
///
/// Always used as an instance (`new MongoIdPipe()`), never as a class, so
/// Nest doesn't try to inject the options object.
export class MongoIdPipe implements PipeTransform<unknown, string | undefined> {
  constructor(private readonly options: { optional?: boolean } = {}) {}

  transform(value: unknown): string | undefined {
    if (value === undefined || value === '') {
      if (this.options.optional) return undefined;
      throw new BadRequestException({ error: 'invalid_id' });
    }
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value) || !/^[0-9a-fA-F]{24}$/.test(value)) {
      throw new BadRequestException({ error: 'invalid_id' });
    }
    return value;
  }
}
