import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { ApiUsageService } from '../api-usage/api-usage.service';
import {
  DEFAULT_GOOGLE_PHOTOS_MONTHLY_CAP,
  GOOGLE_PHOTOS_PROVIDER,
  fetchPhotoUri,
} from '../integrations/google-places.adapter';

/// Widths we're willing to serve. Restricted on purpose: an open width
/// parameter would let a caller fragment the cache into unlimited variants,
/// and every miss is a billed photo fetch.
const ALLOWED_WIDTHS = [400, 800, 1200] as const;
const DEFAULT_WIDTH = 800;

/// Google Maps Platform permits caching place content for 30 days.
const PHOTO_REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/// How long a resolved image URL is reused. Google's signed URLs outlive this
/// comfortably; the short window is what stops a burst of viewers of the same
/// place from each buying their own copy.
const RESOLVED_URI_TTL_MS = 30 * 60 * 1000;

/// Covers the gap between a live Google search returning a place and that
/// place's fire-and-forget write landing in Mongo. Without it, the first
/// person to see a brand-new place gets a glyph instead of its photo.
const PENDING_REF_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class PhotosService {
  constructor(
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    private readonly apiUsageService: ApiUsageService,
  ) {}

  /// ref+width -> resolved image URL.
  private readonly resolved = new Map<string, CacheEntry<string>>();

  /// Google place id -> photo reference, for places we've just returned from a
  /// live search but haven't finished persisting yet.
  private readonly pending = new Map<string, CacheEntry<string>>();

  static normalizeWidth(raw: unknown): number {
    // Number('') is 0, not NaN — without this an empty `?w=` would snap to the
    // smallest width and serve a blurry image where a full-size one belongs.
    if (typeof raw === 'string' && raw.trim() === '') return DEFAULT_WIDTH;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH;
    // Snap to the nearest allowed width rather than rejecting: a client asking
    // for 360 wants a small image, and serving it 400 is the right answer.
    return ALLOWED_WIDTHS.reduce((best, w) => (Math.abs(w - n) < Math.abs(best - n) ? w : best), DEFAULT_WIDTH);
  }

  /// Called by the search path for places returned straight from Google,
  /// before their Business row exists.
  rememberPendingRef(sourceId: string, photoRef: string | null): void {
    if (!photoRef) return;
    this.pending.set(sourceId, { value: photoRef, expiresAt: Date.now() + PENDING_REF_TTL_MS });
  }

  /// Resolves a place id to a fetchable image URL, or null when there's no
  /// usable photo. Never throws for the ordinary "no photo" cases — the card
  /// has a designed fallback and a 404 is a fine, cheap answer.
  async resolvePhotoUrl(id: string, width: number): Promise<string | null> {
    const photoRef = await this.findPhotoRef(id);
    if (!photoRef) return null;

    const cacheKey = `${photoRef}|${width}`;
    const hit = this.readCache(this.resolved, cacheKey);
    if (hit) return hit;

    const cap = process.env.GOOGLE_PHOTOS_MONTHLY_CAP
      ? Number(process.env.GOOGLE_PHOTOS_MONTHLY_CAP)
      : DEFAULT_GOOGLE_PHOTOS_MONTHLY_CAP;
    const usage = await this.apiUsageService.getUsage(GOOGLE_PHOTOS_PROVIDER);
    if (usage.count >= cap) {
      console.warn(`[photos] skipped: ${usage.count}/${cap} used for ${usage.period}`);
      return null;
    }

    let uri: string | null;
    try {
      uri = await fetchPhotoUri(photoRef, width);
      await this.apiUsageService.increment(GOOGLE_PHOTOS_PROVIDER);
    } catch (e) {
      // A photo is decoration, not the answer — degrade to the glyph rather
      // than failing the card.
      console.error('[photos] resolve failed:', (e as Error).message || e);
      return null;
    }

    if (uri) this.resolved.set(cacheKey, { value: uri, expiresAt: Date.now() + RESOLVED_URI_TTL_MS });
    return uri;
  }

  /// A place id is either one of our Business ids or, for a result served
  /// straight from a live Google search, Google's own place id.
  private async findPhotoRef(id: string): Promise<string | null> {
    const query = isValidObjectId(id)
      ? { _id: id }
      : { 'sourceLinks.source': 'google', 'sourceLinks.sourceId': id };

    const business = await this.businessModel.findOne(query).select('photoRef photoRefUpdatedAt').lean();

    if (business?.photoRef) {
      const updatedAt = business.photoRefUpdatedAt ? new Date(business.photoRefUpdatedAt).getTime() : 0;
      if (Date.now() - updatedAt < PHOTO_REF_TTL_MS) return business.photoRef;
    }

    return this.readCache(this.pending, id);
  }

  private readCache<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }
}
