import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { EARTH_RADIUS_METERS, haversineMeters } from '../common/utils/geo.util';
import { SearchBusinessDto } from './dto/search-business.dto';
import { parseQuery } from './query-parser';
import { ApiUsageService } from '../api-usage/api-usage.service';
import { BusinessesService } from '../businesses/businesses.service';
import { PhotosService } from '../photos/photos.service';
import {
  GOOGLE_PLACES_PROVIDER,
  DEFAULT_GOOGLE_PLACES_MONTHLY_CAP,
  GOOGLE_TYPE_BY_CATEGORY,
  GooglePlaceResult,
  searchNearby,
  searchText,
} from '../integrations/google-places.adapter';

// Businesses auto-cached from a live user search, as opposed to the ones an
// admin deliberately sourced/onboarded. Both live in `businesses`, but only
// curated ones may claim source:'rico' (which unlocks catalog + ordering in
// the app) — an auto-cached row has no products behind it.
const LIVE_CACHE_ENRICHMENT = 'google_live';

interface SearchPlace {
  id: string;
  name: string;
  nameAr: string | null;
  categorySlug: string;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  openingHours: string | null;
  /// true/false from Google; null when nobody could tell us.
  openNow: boolean | null;
  priceLevel: number | null;
  rating: number | null;
  ratingCount: number | null;
  distanceMeters: number;
  source: 'rico' | 'google';
  /// Our own proxy URL for this place's photo, or null when it has none. Never
  /// a Google URL: resolving it needs the API key, which stays server-side.
  photoUrl: string | null;
  /// Photo author, to be credited by whoever displays the image.
  photoAttribution: string | null;
}

/// The app never sees a Google photo URL — it asks us, and we resolve it (and
/// pay for it) only if the image is actually displayed.
function photoUrlFor(placeId: string): string {
  return `/places/${placeId}/photo`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sortByRank(places: SearchPlace[], rank: string): void {
  if (rank === 'nearest') {
    places.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return;
  }
  places.sort((a, b) => {
    const aVal = rank === 'cheapest' ? a.priceLevel : a.rating;
    const bVal = rank === 'cheapest' ? b.priceLevel : b.rating;
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    return rank === 'cheapest' ? aVal - bVal : bVal - aVal;
  });
}

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly apiUsageService: ApiUsageService,
    private readonly businessesService: BusinessesService,
    private readonly photosService: PhotosService,
  ) {}

  // GET /search — ported from routes/search.js. Response shape must stay
  // byte-identical (aside from the added `source` field): the Flutter app
  // parses this directly. `nearest` uses Mongo's $near (native distance
  // sort); `cheapest`/`best_rated` use $geoWithin (radius filter only) + an
  // explicit JS sort, since $near always sorts by distance and can't be
  // combined with a different sort in the same query.
  async searchBusinesses(dto: SearchBusinessDto) {
    const { lat, lng } = dto;
    const radiusMeters = dto.radius ?? 3000;
    const rank = dto.rank ?? 'nearest';
    const limit = dto.limit ?? 8;

    const filter: Record<string, unknown> = { isActive: true };
    if (dto.categorySlug) filter.categorySlug = dto.categorySlug;

    // When the user named something specific — a brand ("ستاربكس") or a
    // free-text category we have no slug for ("محل عطور") — the DB side must
    // match that name too. Filtering by category alone would answer "أقرب
    // ستاربكس" with any nearby cafe, and a label-only query (no category at
    // all) would return whatever happens to sit nearby.
    const nameNeedle = dto.brandHint ?? (dto.categorySlug ? undefined : dto.label);
    if (nameNeedle) {
      const re = new RegExp(escapeRegex(nameNeedle), 'i');
      filter.$or = [{ name: re }, { nameAr: re }];
    }

    let businesses;
    if (rank === 'nearest') {
      filter.location = {
        $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radiusMeters },
      };
      businesses = await this.businessModel.find(filter).limit(limit).lean();
    } else {
      filter.location = { $geoWithin: { $centerSphere: [[lng, lat], radiusMeters / EARTH_RADIUS_METERS] } };
      // Fetch extra and sort in JS so null price/rating always sinks to the
      // bottom regardless of Mongo's null-sort-order default.
      const raw = await this.businessModel
        .find(filter)
        .limit(limit * 3)
        .lean();
      raw.sort((a, b) => {
        const aVal = rank === 'cheapest' ? a.priceLevel : a.rating;
        const bVal = rank === 'cheapest' ? b.priceLevel : b.rating;
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        return rank === 'cheapest' ? aVal - bVal : bVal - aVal;
      });
      businesses = raw.slice(0, limit);
    }

    let places: SearchPlace[] = businesses.map((b) => this.toSearchPlace(b, lat, lng));

    // Our own DB coverage is necessarily partial (only businesses we've
    // onboarded, synced, or auto-cached) — fill the shortfall from Google,
    // the global fallback, while under the shared monthly budget.
    if (places.length < limit) {
      const fallback = await this.fetchGoogleFallback({
        lat,
        lng,
        radiusMeters,
        rank,
        categorySlug: dto.categorySlug,
        brandHint: dto.brandHint,
        label: dto.label,
        needed: limit - places.length,
        seenBusinessIds: new Set(places.map((p) => p.id)),
      });
      places = [...places, ...fallback];
    }

    // An explicit "open now" request must not silently return closed places.
    // Google-sourced results carry a real verdict; our own rows usually don't
    // (openNow null), and dropping those would hide real partners, so they're
    // kept — only the definitively-closed ones go.
    if (rank === 'open_now') {
      places = places.filter((p) => p.openNow !== false);
    }

    sortByRank(places, rank);
    places = places.slice(0, limit);

    await this.backfillProductPhotos(places);

    // Never claim a ranking the data can't back up.
    const priceDataAvailable = rank !== 'cheapest' || places.some((p) => p.priceLevel != null);
    const ratingDataAvailable = rank !== 'best_rated' || places.some((p) => p.rating != null);
    // Lets the client phrase "open now" honestly instead of asserting it for
    // results nobody actually verified.
    const openNowVerified = places.length > 0 && places.every((p) => p.openNow === true);

    return { priceDataAvailable, ratingDataAvailable, openNowVerified, places };
  }

  private toSearchPlace(b: any, lat: number, lng: number): SearchPlace {
    return {
      id: String(b._id),
      name: b.name,
      nameAr: b.nameAr,
      categorySlug: b.categorySlug,
      lat: b.location.coordinates[1],
      lng: b.location.coordinates[0],
      address: b.address,
      phone: b.phone,
      openingHours: b.openingHours,
      openNow: null, // stored hours are free text; we don't guess from them
      priceLevel: b.priceLevel,
      rating: b.rating,
      ratingCount: b.ratingCount,
      distanceMeters: haversineMeters(lat, lng, b.location.coordinates[1], b.location.coordinates[0]),
      // Auto-cached rows are Google data wearing a Business document — they
      // have no catalog, so they must not unlock ordering in the app.
      source: b.enrichmentSource === LIVE_CACHE_ENRICHMENT ? 'google' : 'rico',
      // Order matters: the vendor's own storefront photo beats Google's,
      // which beats a product close-up (filled in by backfillProductPhotos),
      // which beats the category glyph the app draws when all three are absent.
      photoUrl: b.imageUrl ?? (b.photoRef ? photoUrlFor(String(b._id)) : null),
      // Only Google's photo carries a credit — a vendor crediting themselves
      // for a photo of their own shop reads as noise.
      photoAttribution: b.imageUrl ? null : (b.photoAttribution ?? null),
    };
  }

  /// Last resort before the category glyph: a vendor who never uploaded a
  /// storefront photo but did photograph their products still has a real
  /// picture we can show. One query over the handful of results actually being
  /// returned — not one per business, and never for places that already have a
  /// photo.
  private async backfillProductPhotos(places: SearchPlace[]): Promise<void> {
    const missing = places.filter((p) => !p.photoUrl && p.source === 'rico' && isValidObjectId(p.id));
    if (missing.length === 0) return;

    const products = await this.productModel
      .find({ businessId: { $in: missing.map((p) => p.id) }, imageUrl: { $ne: null }, isActive: true })
      .select('businessId imageUrl')
      .lean();

    const firstByBusiness = new Map<string, string>();
    for (const product of products) {
      const key = String(product.businessId);
      if (product.imageUrl && !firstByBusiness.has(key)) firstByBusiness.set(key, product.imageUrl);
    }

    for (const place of missing) {
      const url = firstByBusiness.get(place.id);
      if (url) place.photoUrl = url;
    }
  }

  // Google Places is paid and capped monthly, shared with the admin
  // sourcing-sync tool (ApiUsageService, provider google_places) — any
  // failure here (cap reached, network, API error) degrades silently to
  // whatever the DB already returned rather than breaking the search.
  private async fetchGoogleFallback({
    lat,
    lng,
    radiusMeters,
    rank,
    categorySlug,
    brandHint,
    label,
    needed,
    seenBusinessIds,
  }: {
    lat: number;
    lng: number;
    radiusMeters: number;
    rank: string;
    categorySlug?: string;
    brandHint?: string;
    label?: string;
    needed: number;
    seenBusinessIds: Set<string>;
  }): Promise<SearchPlace[]> {
    const cap = process.env.GOOGLE_PLACES_MONTHLY_CAP
      ? Number(process.env.GOOGLE_PLACES_MONTHLY_CAP)
      : DEFAULT_GOOGLE_PLACES_MONTHLY_CAP;
    const usage = await this.apiUsageService.getUsage(GOOGLE_PLACES_PROVIDER);
    if (usage.count >= cap) {
      console.warn(`[search] Google Places skipped: ${usage.count}/${cap} used for ${usage.period}`);
      return [];
    }

    // Nearby Search can't do brand names, free-text categories, or an
    // open-now filter — Text Search can do all three, so anything that needs
    // one of them routes there. Plain category browsing stays on Nearby,
    // which returns tighter category matches.
    const knownType = categorySlug ? GOOGLE_TYPE_BY_CATEGORY[categorySlug] : undefined;
    const needsText = Boolean(brandHint) || rank === 'open_now' || !knownType;
    const textQuery = brandHint || label || categorySlug;
    if (needsText && !textQuery) return [];

    let results: GooglePlaceResult[];
    try {
      results = needsText
        ? await searchText({
            textQuery: textQuery!,
            lat,
            lng,
            radiusMeters,
            categorySlug: categorySlug ?? 'other',
            openNow: rank === 'open_now',
            includedType: knownType?.[0],
          })
        : await searchNearby({ lat, lng, radiusMeters, categorySlug: categorySlug! });
      await this.apiUsageService.increment(GOOGLE_PLACES_PROVIDER);
    } catch (e) {
      console.error('[search] Google Places call failed:', (e as Error).message || e);
      return [];
    }
    if (results.length === 0) return [];

    // One query for every Google id at once — the per-result findOne this
    // replaced meant up to 20 sequential round-trips on a single search.
    const existing = await this.businessModel
      .find({
        'sourceLinks.source': 'google',
        'sourceLinks.sourceId': { $in: results.map((g) => g.sourceId) },
        isActive: true,
      })
      .lean();
    const existingBySourceId = new Map<string, any>();
    for (const b of existing) {
      for (const link of b.sourceLinks ?? []) {
        if (link.source === 'google') existingBySourceId.set(link.sourceId, b);
      }
    }

    const places: SearchPlace[] = [];
    const toCache: GooglePlaceResult[] = [];

    for (const g of results) {
      if (places.length >= needed) break;
      const matched = existingBySourceId.get(g.sourceId);

      if (matched) {
        // Already ours: prefer the stored record (it may carry a catalog and
        // curated Arabic name), but take Google's live open/closed verdict.
        if (seenBusinessIds.has(String(matched._id))) continue;
        seenBusinessIds.add(String(matched._id));
        places.push({ ...this.toSearchPlace(matched, lat, lng), openNow: g.openNow });
        continue;
      }

      toCache.push(g);
      places.push({
        id: g.sourceId,
        name: g.name,
        nameAr: null,
        categorySlug: g.categorySlug,
        lat: g.location.coordinates[1],
        lng: g.location.coordinates[0],
        address: g.address,
        phone: g.phone,
        openingHours: g.openingHours,
        openNow: g.openNow,
        priceLevel: g.priceLevel,
        rating: g.rating,
        ratingCount: g.ratingCount,
        distanceMeters: haversineMeters(lat, lng, g.location.coordinates[1], g.location.coordinates[0]),
        source: 'google',
        // Keyed by Google's id, because this place has no Business row yet —
        // rememberPendingRef below covers the window until the write lands.
        photoUrl: g.photoRef ? photoUrlFor(g.sourceId) : null,
        photoAttribution: g.photoAttribution,
      });
      this.photosService.rememberPendingRef(g.sourceId, g.photoRef);
    }

    // Persist what we just paid for, so the next identical search is served
    // from Mongo instead of buying the same places again. Fire-and-forget:
    // the user's results are already assembled and must not wait on writes.
    void this.cacheGooglePlaces(toCache);

    return places;
  }

  /// Stores freshly-fetched Google places as Business rows marked
  /// [LIVE_CACHE_ENRICHMENT], so they're reused by the DB query next time but
  /// never mistaken for a curated, catalog-backed partner.
  private async cacheGooglePlaces(results: GooglePlaceResult[]): Promise<void> {
    for (const g of results) {
      try {
        const { sourceId, ...rest } = g;
        await this.businessesService.upsertBySource('google', sourceId, {
          ...rest,
          // Dates the photo reference so it can be retired at 30 days, per
          // Google's caching terms.
          photoRefUpdatedAt: rest.photoRef ? new Date() : null,
          enrichmentSource: LIVE_CACHE_ENRICHMENT,
        } as any);
      } catch (e) {
        console.error('[search] caching Google place failed:', (e as Error).message || e);
      }
    }
  }

  // GET /search/products — new rule-based product-catalog search (per the
  // local-discovery-platform plan): parse the free-text query, then build a
  // Mongo filter/sort from the structured result. Composition, not
  // injection — parseQuery is a plain function, not a Nest provider.
  async searchProducts(text: string, businessId?: string) {
    const parsed = parseQuery(text);

    const filter: Record<string, unknown> = { isActive: true };
    if (businessId) filter.businessId = businessId;
    if (parsed.category) filter.category = parsed.category;
    for (const [key, value] of Object.entries(parsed.attributes)) {
      filter[`attributes.${key}`] = value;
    }
    if (parsed.keyword) {
      filter.$text = { $search: parsed.keyword };
    }

    const sortStage: Record<string, 1 | -1> =
      parsed.sort === 'price_asc' ? { finalPrice: 1 } : parsed.sort === 'price_desc' ? { finalPrice: -1 } : {};

    const products = await this.productModel.find(filter).sort(sortStage).limit(20).lean();

    return {
      parsed,
      products: products.map((p) => ({
        id: p._id,
        businessId: p.businessId,
        name: p.name,
        category: p.category,
        price: p.price,
        finalPrice: p.finalPrice,
        imageUrl: p.imageUrl ?? null,
        attributes: p.attributes,
      })),
    };
  }
}
