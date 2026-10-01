import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { signState, verifyState, StateError } from './oauth-state';
import { InstagramConnection, InstagramConnectionDocument } from './schemas/instagram-connection.schema';
import { BusinessClaim, BusinessClaimDocument } from '../vendor/schemas/business-claim.schema';
import { Deal, DealDocument } from '../deals/schemas/deal.schema';
import { LlmService } from '../llm/llm.service';
import { parseCaption } from './offer-parser';
import {
  authorizeUrl,
  exchangeCode,
  exchangeForLongLived,
  fetchMedia,
  fetchProfile,
  isConfigured,
  refreshLongLived,
} from './instagram-api.adapter';
import { DEFAULT_OFFER_TTL_DAYS, INSTAGRAM_SOURCE, TOKEN_REFRESH_AFTER_DAYS } from './instagram.constants';

export interface ImportResult {
  postsRead: number;
  offersFound: number;
  status: string;
}

@Injectable()
export class InstagramService {
  constructor(
    @InjectModel(InstagramConnection.name) private readonly connectionModel: Model<InstagramConnectionDocument>,
    @InjectModel(BusinessClaim.name) private readonly claimModel: Model<BusinessClaimDocument>,
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
    private readonly llm: LlmService,
  ) {}

  private async assertClaimed(accountId: string, businessId: string): Promise<void> {
    const claim = await this.claimModel.findOne({ accountId, businessId, status: 'active' }).lean();
    if (!claim) throw new ForbiddenException({ error: 'place_not_claimed' });
  }

  async connectUrl(accountId: string, businessId: string) {
    if (!isConfigured()) throw new BadRequestException({ error: 'instagram_not_configured' });
    await this.assertClaimed(accountId, businessId);
    return { url: authorizeUrl(signState(accountId, businessId)) };
  }

  /// Completes the flow. The vendor's browser arrives here from Instagram
  /// carrying their session cookie, so we know who they are without trusting
  /// anything in the query string beyond the signed state.
  async completeConnection(accountId: string, code: string, state: string): Promise<{ businessId: string }> {
    let businessId: string;
    try {
      businessId = verifyState(state, accountId);
    } catch (e) {
      // A bad state is either a stale link or a forged one. Neither deserves
      // detail in the response.
      throw e instanceof StateError ? new ForbiddenException({ error: e.message }) : e;
    }
    await this.assertClaimed(accountId, businessId);

    const { accessToken: shortToken, igUserId } = await exchangeCode(code);
    // Straight to a 60-day token: a one-hour one cannot survive until the
    // first scheduled import.
    const { accessToken, expiresInSeconds } = await exchangeForLongLived(shortToken);
    const { username } = await fetchProfile(accessToken);

    await this.connectionModel.findOneAndUpdate(
      { businessId },
      {
        businessId,
        igUserId,
        username,
        accessToken,
        tokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        connectedByAccountId: accountId,
        lastStatus: 'connected',
      },
      { upsert: true },
    );

    return { businessId };
  }

  /// What the dashboard is allowed to know: never the token.
  async status(accountId: string, businessId: string) {
    await this.assertClaimed(accountId, businessId);
    const connection = await this.connectionModel.findOne({ businessId }).lean();
    if (!connection) return { connected: false, configured: isConfigured() };

    return {
      connected: true,
      configured: isConfigured(),
      username: connection.username,
      lastImportedAt: connection.lastImportedAt,
      lastStatus: connection.lastStatus,
      // Surfaced so a vendor can see a link going stale before it breaks.
      expiresAt: connection.tokenExpiresAt,
    };
  }

  async disconnect(accountId: string, businessId: string) {
    await this.assertClaimed(accountId, businessId);
    await this.connectionModel.deleteOne({ businessId });
    // Offers imported from the account go too. A vendor who disconnects is
    // withdrawing consent, and leaving their posts on display would ignore it.
    await this.dealModel.deleteMany({ businessId, source: INSTAGRAM_SOURCE });
    return { disconnected: true };
  }

  /// Reads the vendor's recent posts and turns the ones that are offers into
  /// deals. Posts that aren't offers are simply skipped — see offer-parser.
  async importOffers(accountId: string, businessId: string): Promise<ImportResult> {
    await this.assertClaimed(accountId, businessId);

    const connection = await this.connectionModel.findOne({ businessId }).select('+accessToken');
    if (!connection) throw new NotFoundException({ error: 'not_connected' });

    const token = await this.usableToken(connection);
    if (!token) return this.finish(connection, 'reconnect needed', 0, 0);

    let media;
    try {
      media = await fetchMedia(token);
    } catch (e) {
      return this.finish(connection, `instagram error: ${(e as Error).message.slice(0, 80)}`, 0, 0);
    }

    const captions = media.filter((m) => m.caption && m.caption.trim().length > 0);
    // Sequentially: each caption is an LLM call, and a burst of 25 would hit
    // the provider's per-minute limit and fail most of them.
    const parsed: { media: (typeof media)[number]; offer: NonNullable<Awaited<ReturnType<typeof parseCaption>>> }[] = [];
    for (const item of captions) {
      const offer = await parseCaption(this.llm, item.caption!);
      if (offer) parsed.push({ media: item, offer });
    }

    // Replace rather than accumulate: the account is the truth, and a post
    // that has gone should not leave an offer behind.
    await this.dealModel.deleteMany({ businessId, source: INSTAGRAM_SOURCE });

    if (parsed.length > 0) {
      const fallbackEnd = new Date(Date.now() + DEFAULT_OFFER_TTL_DAYS * 24 * 60 * 60 * 1000);
      await this.dealModel.insertMany(
        parsed.map(({ media: post, offer }) => ({
          businessId,
          titleAr: offer.titleAr,
          descriptionAr: offer.descriptionAr,
          dealType: offer.dealType,
          value: offer.value,
          currency: 'SAR',
          promoCode: offer.promoCode,
          startsAt: null,
          // The caption's own end date when it names one, otherwise a default
          // — an Instagram post outlives the offer behind it.
          endsAt: offer.endsAt ? new Date(offer.endsAt) : fallbackEnd,
          status: 'active',
          source: INSTAGRAM_SOURCE,
          // The post it came from, so a vendor can check what we read.
          sourceRef: post.permalink,
          ownerAccountId: accountId,
          verifiedAt: new Date(),
        })),
      );
    }

    return this.finish(connection, `ok: ${parsed.length} offers from ${captions.length} posts`, captions.length, parsed.length);
  }

  /// Returns a token good for right now, refreshing it if it is close to
  /// lapsing, or null when it has already lapsed and the vendor must
  /// reconnect.
  private async usableToken(connection: InstagramConnectionDocument): Promise<string | null> {
    const msLeft = connection.tokenExpiresAt.getTime() - Date.now();
    if (msLeft <= 0) return null;

    const refreshAfterMs = TOKEN_REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;
    const age = 60 * 24 * 60 * 60 * 1000 - msLeft;
    if (age < refreshAfterMs) return connection.accessToken;

    try {
      const { accessToken, expiresInSeconds } = await refreshLongLived(connection.accessToken);
      connection.accessToken = accessToken;
      connection.tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      await connection.save();
      return accessToken;
    } catch {
      // Refresh failed but the current token has not expired yet — use it and
      // try again next time rather than breaking an import that would work.
      return connection.accessToken;
    }
  }

  private async finish(
    connection: InstagramConnectionDocument,
    status: string,
    postsRead: number,
    offersFound: number,
  ): Promise<ImportResult> {
    connection.lastImportedAt = new Date();
    connection.lastStatus = status;
    await connection.save();
    return { postsRead, offersFound, status };
  }
}
