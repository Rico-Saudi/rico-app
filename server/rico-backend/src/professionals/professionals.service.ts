import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { ProfessionalRequest, ProfessionalRequestDocument } from './schemas/professional-request.schema';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';
import { CreateProfessionalRequestDto } from './dto/create-professional-request.dto';
import {
  ProfessionalFile,
  ProfessionalFileDocument,
  ProfessionalFileKind,
} from './schemas/professional-file.schema';
import { professionLabel } from './constants/professions.registry';
import {
  ALLOWED_CV_TYPES,
  ALLOWED_PHOTO_TYPES,
  DEFAULT_CARD_ACCENT,
  FILE_TOKEN_PATTERN,
  MAX_CV_BYTES,
  MAX_PHOTO_BYTES,
  professionalFileUrl,
} from './constants/professional-card.constants';
import { MailerService } from '../mailer/mailer.service';
import { brandFor } from '../common/constants/brands';

// What search hands back to the app: the professional's business card,
// minus the one thing a card would normally carry.
//
// Deliberately missing the phone and email. The card is public — anyone can
// run this search, for any trade, anywhere — so putting the number on it
// would turn the whole directory into a phone list. The customer sends a
// request and the professional calls back; that stays true no matter how
// much the card grows.
//
// Everything else *is* theirs to publish: the bio they wrote, the skills
// they listed, the years they claim, and the CV they attached, which is a
// credential they chose to put on it.
export interface ProfessionalResult {
  id: string;
  name: string;
  profession: string;
  professionLabel: string;
  photoUrl: string | null;
  headline: string | null;
  bio: string | null;
  skills: string[];
  yearsExperience: number | null;
  cardAccent: string;
  cvUrl: string | null;
  cvFileName: string | null;
  cvContentType: string | null;
  distanceMeters: number;
  serviceRadiusMeters: number;
}

@Injectable()
export class ProfessionalsService {
  private readonly logger = new Logger(ProfessionalsService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(ProfessionalRequest.name) private readonly requestModel: Model<ProfessionalRequestDocument>,
    @InjectModel(ProfessionalFile.name) private readonly fileModel: Model<ProfessionalFileDocument>,
    private readonly mailerService: MailerService,
  ) {}

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
          'professional.photoUrl': 1,
          'professional.headline': 1,
          'professional.bio': 1,
          'professional.skills': 1,
          'professional.yearsExperience': 1,
          'professional.cardAccent': 1,
          'professional.cvUrl': 1,
          'professional.cvFileName': 1,
          'professional.cvContentType': 1,
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
        photoUrl: r.professional.photoUrl ?? null,
        headline: r.professional.headline ?? null,
        bio: r.professional.bio ?? null,
        skills: r.professional.skills ?? [],
        yearsExperience: r.professional.yearsExperience ?? null,
        cardAccent: r.professional.cardAccent ?? DEFAULT_CARD_ACCENT,
        cvUrl: r.professional.cvUrl ?? null,
        cvFileName: r.professional.cvFileName ?? null,
        cvContentType: r.professional.cvContentType ?? null,
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

  // ─── The files on the card ───────────────────────────────────────────────
  // Two kinds, one path: the photo of the professional, and the CV they
  // published. Both are stored, tokenized and served identically; only the
  // allowed types, the size cap and the profile fields differ.

  /** Attaches the CV. Replaces whatever was there: the previous bytes are
   * dropped, so someone who re-uploads a corrected version ten times doesn't
   * leave ten orphaned documents behind. */
  async setCv(customer: CustomerDocument, file: Express.Multer.File | undefined) {
    const stored = await this.storeFile(customer, file, {
      kind: 'cv',
      allowedTypes: ALLOWED_CV_TYPES,
      maxBytes: MAX_CV_BYTES,
      typeError: 'unsupported_cv_type',
      sizeError: 'cv_too_large',
    });

    customer.professional!.cvUrl = professionalFileUrl(stored.token);
    customer.professional!.cvFileName = stored.fileName;
    customer.professional!.cvContentType = stored.contentType;
    await customer.save();

    return customer;
  }

  async removeCv(customer: CustomerDocument) {
    if (!customer.professional) throw new BadRequestException({ error: 'professional_profile_required' });

    await this.fileModel.deleteMany({ customerId: customer._id, kind: 'cv' });
    customer.professional.cvUrl = null;
    customer.professional.cvFileName = null;
    customer.professional.cvContentType = null;
    await customer.save();

    return customer;
  }

  /** Attaches the photo shown on the card. Images only, and smaller than a
   * CV: it is rendered into a circle the size of a thumbnail. */
  async setPhoto(customer: CustomerDocument, file: Express.Multer.File | undefined) {
    const stored = await this.storeFile(customer, file, {
      kind: 'photo',
      allowedTypes: ALLOWED_PHOTO_TYPES,
      maxBytes: MAX_PHOTO_BYTES,
      typeError: 'unsupported_photo_type',
      sizeError: 'photo_too_large',
    });

    customer.professional!.photoUrl = professionalFileUrl(stored.token);
    await customer.save();

    return customer;
  }

  /** Detaching the photo isn't a downgrade: the card falls back to the
   * monogram it drew before one was uploaded. */
  async removePhoto(customer: CustomerDocument) {
    if (!customer.professional) throw new BadRequestException({ error: 'professional_profile_required' });

    await this.fileModel.deleteMany({ customerId: customer._id, kind: 'photo' });
    customer.professional.photoUrl = null;
    await customer.save();

    return customer;
  }

  /** Public, like the card these hang off: a customer comparing two painters
   * in chat has to be able to see the faces and open the CVs. */
  async findFile(token: string): Promise<ProfessionalFileDocument> {
    // This route is public, so a crawler with a mangled token shouldn't
    // reach the driver and surface as a logged 500 — a malformed one is
    // simply not found.
    if (!FILE_TOKEN_PATTERN.test(token)) throw new NotFoundException({ error: 'file_not_found' });
    const document = await this.fileModel.findOne({ token });
    if (!document) throw new NotFoundException({ error: 'file_not_found' });
    return document;
  }

  /** Validates and stores one file, dropping the previous one of that kind.
   *
   * Requires a profile to exist — a CV or a face with no card to sit on has
   * nowhere to be shown. */
  private async storeFile(
    customer: CustomerDocument,
    file: Express.Multer.File | undefined,
    rules: {
      kind: ProfessionalFileKind;
      allowedTypes: string[];
      maxBytes: number;
      typeError: string;
      sizeError: string;
    },
  ): Promise<ProfessionalFileDocument> {
    if (!customer.professional) throw new BadRequestException({ error: 'professional_profile_required' });
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'file_required' });
    if (!rules.allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException({ error: rules.typeError, allowed: rules.allowedTypes });
    }
    if (file.size > rules.maxBytes) {
      throw new PayloadTooLargeException({ error: rules.sizeError, maxBytes: rules.maxBytes });
    }

    const document = await this.fileModel.create({
      token: randomBytes(16).toString('hex'),
      customerId: customer._id,
      kind: rules.kind,
      contentType: file.mimetype,
      fileName: this.safeFileName(file.originalname, file.mimetype),
      size: file.size,
      data: file.buffer,
    });
    // Only after the new one is safely stored, so a failed write leaves the
    // card pointing at the file it already had. Scoped by kind, so replacing
    // a photo never takes the CV with it.
    await this.fileModel.deleteMany({ customerId: customer._id, kind: rules.kind, _id: { $ne: document._id } });

    return document;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /** A filename safe to echo back in a Content-Disposition header and to
   * show on the card. Anything a device might send — a path, a quote, a
   * newline, an overlong name — is dropped rather than escaped, and a name
   * left with nothing usable falls back to a generic one with the right
   * extension. */
  private safeFileName(original: string | undefined, mimetype: string): string {
    const fallback = mimetype === 'application/pdf' ? 'cv.pdf' : 'cv.jpg';
    const base = (original ?? '').split(/[\\/]/).pop() ?? '';
    const cleaned = base
      .replace(/[^\p{L}\p{N}._ -]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    return cleaned.replace(/^[._ -]+/, '') || fallback;
  }

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
