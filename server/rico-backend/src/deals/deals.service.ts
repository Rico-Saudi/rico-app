import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deal, DealDocument } from './schemas/deal.schema';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { EARTH_RADIUS_METERS, haversineMeters } from '../common/utils/geo.util';
import { CreateDealDto } from './dto/create-deal.dto';
import { WeatherService } from '../weather/weather.service';
import { CATEGORY_AFFINITY, WEATHER_AFFINITY_FACTOR, WeatherSnapshot } from '../weather/weather.constants';
import { SCRAPED_SOURCE, SCRAPED_RANK_PENALTY } from '../scraping/scraping.constants';

// A deal a vendor restricted to certain weather is only shown in it. When we
// don't know the weather — no key, API down — every deal is shown: failing
// open keeps an outage at OpenWeather from quietly hiding vendors' offers.
function matchesWeather(deal: { weatherConditions?: string[] | null }, weather: WeatherSnapshot | null): boolean {
  const wanted = deal.weatherConditions;
  if (!wanted || wanted.length === 0) return true;
  if (!weather) return true;
  return wanted.includes(weather.bucket);
}

// Does this deal suit the weather — either because its vendor said so, or
// because its category generally does? Used only to order, never to exclude.
function suitsWeather(
  deal: { weatherConditions?: string[] | null },
  categorySlug: string | undefined,
  weather: WeatherSnapshot | null,
): boolean {
  if (!weather) return false;
  if (deal.weatherConditions?.includes(weather.bucket)) return true;
  return categorySlug ? CATEGORY_AFFINITY[weather.bucket].includes(categorySlug) : false;
}

// active_days/active_time need JS evaluation (day-of-week/time-of-day
// windows) — ported as-is from the old deals.js.
function isActiveNow(deal: { activeDays?: string[] | null; activeTime?: { from?: string | null; to?: string | null } | null }, now: Date): boolean {
  if (deal.activeDays && deal.activeDays.length > 0) {
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getUTCDay()];
    if (!deal.activeDays.includes(dayKey)) return false;
  }

  if (deal.activeTime?.from && deal.activeTime?.to) {
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const [fromH, fromM] = deal.activeTime.from.split(':').map(Number);
    const [toH, toM] = deal.activeTime.to.split(':').map(Number);
    const fromMinutes = fromH * 60 + fromM;
    const toMinutes = toH * 60 + toM;
    if (minutes < fromMinutes || minutes > toMinutes) return false;
  }

  return true;
}

@Injectable()
export class DealsService {
  constructor(
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    private readonly weatherService: WeatherService,
  ) {}

  // GET /deals — ported from routes/deals.js. Response shape (incl. the
  // `placeId` field name) must stay byte-identical: the Flutter app parses
  // this directly.
  async findNearby(lat: number, lng: number, radiusMeters: number, now: Date) {
    const nearbyBusinesses = await this.businessModel
      .find({
        location: { $geoWithin: { $centerSphere: [[lng, lat], radiusMeters / EARTH_RADIUS_METERS] } },
      })
      .lean();

    const businessById = new Map(nearbyBusinesses.map((b) => [String(b._id), b]));

    const deals = await this.dealModel
      .find({
        businessId: { $in: nearbyBusinesses.map((b) => b._id) },
        status: 'active',
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
        ],
      })
      .lean();

    const weather = await this.weatherService.getFor(lat, lng, now);

    const withDistance = deals
      .map((d) => {
        const business = businessById.get(String(d.businessId))!;
        return {
          ...d,
          placeName: business.name,
          categorySlug: business.categorySlug,
          distanceMeters: haversineMeters(lat, lng, business.location.coordinates[1], business.location.coordinates[0]),
        };
      })
      .filter((d) => isActiveNow(d, now))
      .filter((d) => matchesWeather(d, weather));

    // Ordered by distance, with anything that suits the weather treated as
    // if it were nearer. A nudge rather than a reordering: the factor is
    // bounded so the closest useful deal still wins, and nobody is pointed
    // across town for a cold drink because it happens to be warm out.
    const rankDistance = (d: (typeof withDistance)[number]) =>
      d.distanceMeters *
      (suitsWeather(d, d.categorySlug, weather) ? WEATHER_AFFINITY_FACTOR : 1) *
      // Scraped offers sit behind vendor-confirmed ones: nobody at the shop
      // agreed to show them, so they have to be markedly closer to lead.
      (d.source === SCRAPED_SOURCE ? SCRAPED_RANK_PENALTY : 1);

    withDistance.sort((a, b) => rankDistance(a) - rankDistance(b));

    return {
      deals: withDistance.slice(0, 8).map((d) => ({
        id: d._id,
        placeId: d.businessId,
        placeName: d.placeName,
        titleAr: d.titleAr,
        descriptionAr: d.descriptionAr,
        dealType: d.dealType,
        value: d.value,
        currency: d.currency,
        promoCode: d.promoCode,
        distanceMeters: d.distanceMeters,
        source: d.source,
        sourceRef: d.sourceRef,
      })),
    };
  }

  async createManual(dto: CreateDealDto & { source?: string; status?: string }): Promise<DealDocument> {
    return this.dealModel.create({
      businessId: dto.businessId,
      titleAr: dto.titleAr,
      descriptionAr: dto.descriptionAr ?? null,
      dealType: dto.dealType,
      value: dto.value ?? null,
      currency: dto.currency ?? 'SAR',
      promoCode: dto.promoCode ?? null,
      startsAt: dto.startsAt !== undefined ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt !== undefined ? new Date(dto.endsAt) : null,
      activeDays: dto.activeDays ?? null,
      activeTime: dto.activeTime ?? null,
      weatherConditions: dto.weatherConditions ?? null,
      status: dto.status ?? 'active',
      source: dto.source ?? 'manual',
      sourceRef: dto.sourceRef ?? null,
      verifiedAt: new Date(),
    });
  }

  async findPendingReview() {
    const pending = await this.dealModel
      .find({ status: 'pending_review' })
      .populate('businessId', 'name')
      .sort({ createdAt: 1 })
      .lean();

    return pending.map((d: any) => ({
      id: d._id,
      placeId: d.businessId._id,
      placeName: d.businessId.name,
      titleAr: d.titleAr,
      descriptionAr: d.descriptionAr,
      dealType: d.dealType,
      value: d.value,
      promoCode: d.promoCode,
      source: d.source,
      createdAt: d.createdAt,
    }));
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.dealModel.findByIdAndUpdate(id, { status });
  }

  // Cascades from a claim being suspended/rejected — expires every active
  // deal that account created for that business.
  async expireForAccountBusiness(ownerAccountId: string | Types.ObjectId, businessId: string | Types.ObjectId): Promise<void> {
    await this.dealModel.updateMany({ ownerAccountId, businessId, status: 'active' }, { $set: { status: 'expired' } });
  }

  // Same active-window filter as findNearby (status + startsAt/endsAt +
  // isActiveNow's day/time-of-day check), scoped to one business instead of
  // a geo radius — backs the chat catalog view for a specific place.
  async findActiveForBusiness(businessId: string, now: Date) {
    const deals = await this.dealModel
      .find({
        businessId,
        status: 'active',
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
        ],
      })
      .lean();

    return deals.filter((d) => isActiveNow(d, now));
  }
}
