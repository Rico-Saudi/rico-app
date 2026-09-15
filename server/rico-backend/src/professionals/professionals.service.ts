import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { ProfessionalRequest, ProfessionalRequestDocument } from './schemas/professional-request.schema';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';
import { CreateProfessionalRequestDto } from './dto/create-professional-request.dto';
import { professionLabel, professionsByGroup } from './constants/professions';
import { MailerService } from '../mailer/mailer.service';
import { brandFor } from '../common/constants/brands';

// What search hands back to the app. Deliberately missing the professional's
// phone and email: the customer sends a request and the professional calls
// back, so a search — which anyone can run, for any trade, anywhere — never
// becomes a way to harvest the contact details of everyone who signed up.
export interface ProfessionalResult {
  id: string;
  name: string;
  profession: string;
  professionLabel: string;
  headline: string | null;
  distanceMeters: number;
  serviceRadiusMeters: number;
}

@Injectable()
export class ProfessionalsService {
  private readonly logger = new Logger(ProfessionalsService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(ProfessionalRequest.name) private readonly requestModel: Model<ProfessionalRequestDocument>,
    private readonly mailerService: MailerService,
  ) {}

  /** The picker's list, served rather than hardcoded in the app so a trade
   * added here reaches builds already on people's phones. Grouped, because a
   * flat list of 100+ trades is not something anyone scrolls through.
   *
   * `professions` stays alongside `groups` for clients built before grouping
   * existed — they render the flat list exactly as they did. */
  listProfessions() {
    const groups = professionsByGroup();
    return {
      groups,
      professions: groups.flatMap((g) => g.professions.map((p) => ({ ...p, group: g.slug }))),
    };
  }

  // Nearest-first, and honest in both directions: the customer's `radius`
  // caps how far they're willing to look, and each professional's own
  // serviceRadiusMeters caps how far they're willing to go. A painter who
  // serves 10km never surfaces for someone 30km away, so the result list is
  // people who would actually take the job.
  //
  // $geoNear (not $near) because we need the distance itself — to compare
  // against each professional's radius, and to show it on the card.
  async search(dto: SearchProfessionalsDto): Promise<{ professionals: ProfessionalResult[] }> {
    const rows = await this.customerModel.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [dto.lng, dto.lat] },
          distanceField: 'distanceMeters',
          maxDistance: dto.radius ?? 25000,
          key: 'professional.serviceLocation',
          spherical: true,
          query: {
            'professional.profession': dto.profession,
            'professional.isAvailable': true,
            isActive: true,
            // An unverified account can't place a request or log in, so it
            // has no business appearing as someone to call either.
            emailVerified: true,
          },
        },
      },
      { $match: { $expr: { $lte: ['$distanceMeters', '$professional.serviceRadiusMeters'] } } },
      { $limit: dto.limit ?? 8 },
      {
        $project: {
          name: 1,
          distanceMeters: 1,
          'professional.profession': 1,
          'professional.headline': 1,
          'professional.serviceRadiusMeters': 1,
        },
      },
    ]);

    return {
      professionals: rows.map((r: any) => ({
        id: String(r._id),
        name: r.name,
        profession: r.professional.profession,
        professionLabel: professionLabel(r.professional.profession),
        headline: r.professional.headline ?? null,
        distanceMeters: Math.round(r.distanceMeters),
        serviceRadiusMeters: r.professional.serviceRadiusMeters,
      })),
    };
  }

  // The customer's name and phone come from their verified account, never
  // from the request body — same rule as RequestsService.create, and the
  // reason this endpoint requires auth at all.
  async createRequest(dto: CreateProfessionalRequestDto, customer: CustomerDocument, brand?: string) {
    if (String(customer._id) === dto.professionalId) {
      throw new BadRequestException({ error: 'cannot_request_self' });
    }

    const professional = await this.customerModel.findById(dto.professionalId);
    // Treated as "gone" rather than "unavailable": from the customer's side
    // an inactive account and one that stopped offering the trade are the
    // same thing — a card that is no longer valid.
    if (!professional?.professional || !professional.isActive) {
      throw new NotFoundException({ error: 'professional_not_found' });
    }

    const distanceMeters = this.distanceFrom(dto.lat, dto.lng, professional);

    const request = await this.requestModel.create({
      professionalId: professional._id,
      customerId: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      profession: professional.professional.profession,
      note: dto.note?.trim() || null,
      distanceMeters,
    });

    // Best effort: the request is already saved and visible in the
    // professional's inbox, so a mail failure must not fail the call.
    void this.notify(professional, customer, request, brand);

    return { requestId: String(request._id), status: request.status };
  }

  /** The professional's own inbox — scoped to their id by the query itself,
   * so there is no way to read someone else's leads. */
  async listIncoming(professionalId: Types.ObjectId) {
    const requests = await this.requestModel.find({ professionalId }).sort({ createdAt: -1 }).limit(100).lean();

    return {
      requests: requests.map((r: any) => ({
        id: String(r._id),
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        profession: r.profession,
        professionLabel: professionLabel(r.profession),
        note: r.note ?? null,
        distanceMeters: r.distanceMeters ?? null,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }

  async markHandled(id: string, professionalId: Types.ObjectId) {
    const request = await this.requestModel.findOneAndUpdate(
      { _id: id, professionalId },
      { $set: { status: 'handled' } },
      { new: true },
    );
    if (!request) throw new NotFoundException({ error: 'request_not_found' });
    return { id: String(request._id), status: request.status };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  // Straight-line metres from where the customer was standing to the
  // professional's service point, or null if the app didn't send a position
  // (it is optional — the lead is worth delivering either way).
  private distanceFrom(lat?: number, lng?: number, professional?: CustomerDocument): number | null {
    const to = professional?.professional?.serviceLocation?.coordinates;
    if (lat == null || lng == null || !to) return null;

    const [lng2, lat2] = to;
    const lat1 = lat;
    const lng1 = lng;
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  private async notify(
    professional: CustomerDocument,
    customer: CustomerDocument,
    request: ProfessionalRequestDocument,
    brand?: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendProfessionalRequestEmail({
        to: professional.email,
        professionalName: professional.name,
        customerName: customer.name,
        customerPhone: customer.phone,
        professionLabel: professionLabel(request.profession),
        note: request.note,
        brandName: brandFor(brand).name,
      });
    } catch (error) {
      this.logger.warn(`professional request email failed: ${error}`);
    }
  }
}
