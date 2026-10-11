import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ScrapeSource, ScrapeSourceDocument } from './schemas/scrape-source.schema';
import { Deal, DealDocument } from '../deals/schemas/deal.schema';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { ApiUsageService } from '../api-usage/api-usage.service';
import { CreateScrapeSourceDto } from './dto/create-scrape-source.dto';
import { fetchPage, creditCost } from './scraper-api.adapter';
import { extractOffers, discountedOnly, ExtractedOffer } from './offer-extractor';
import { isAllowed } from './robots';
import {
  DEFAULT_SCRAPER_MONTHLY_CREDITS,
  SCRAPED_DEAL_TTL_DAYS,
  SCRAPED_SOURCE,
  SCRAPER_PROVIDER,
} from './scraping.constants';

export interface ScrapeResult {
  status: string;
  offersFound: number;
  dealsWritten: number;
  creditsUsed: number;
}

@Injectable()
export class ScrapingService {
  constructor(
    @InjectModel(ScrapeSource.name) private readonly sourceModel: Model<ScrapeSourceDocument>,
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    private readonly apiUsageService: ApiUsageService,
  ) {}

  async listSources() {
    const sources = await this.sourceModel.find().populate('businessId', 'name nameAr').lean();
    return {
      sources: sources.map((s: any) => ({
        id: s._id,
        businessId: s.businessId?._id,
        businessName: s.businessId?.nameAr || s.businessId?.name || null,
        url: s.url,
        renderJs: s.renderJs,
        enabled: s.enabled,
        lastScrapedAt: s.lastScrapedAt,
        lastStatus: s.lastStatus,
        lastOfferCount: s.lastOfferCount,
      })),
      usage: await this.usage(),
    };
  }

  async addSource(dto: CreateScrapeSourceDto) {
    const business = await this.businessModel.findById(dto.businessId).lean();
    if (!business) throw new NotFoundException({ error: 'business_not_found' });

    const source = await this.sourceModel.create({
      businessId: dto.businessId,
      url: dto.url,
      renderJs: dto.renderJs ?? true,
    });
    return { id: source._id };
  }

  async setEnabled(id: string, enabled: boolean) {
    const source = await this.sourceModel.findByIdAndUpdate(id, { enabled }, { new: true });
    if (!source) throw new NotFoundException({ error: 'source_not_found' });
    return { id: source._id, enabled: source.enabled };
  }

  async removeSource(id: string) {
    await this.sourceModel.findByIdAndDelete(id);
    // Deals collected from it go too. Leaving them would strand offers whose
    // origin nobody can check any more.
    await this.dealModel.deleteMany({ source: SCRAPED_SOURCE, sourceRef: { $regex: `^${id}:` } });
    return { removed: true };
  }

  async usage() {
    const cap = process.env.SCRAPER_MONTHLY_CREDITS
      ? Number(process.env.SCRAPER_MONTHLY_CREDITS)
      : DEFAULT_SCRAPER_MONTHLY_CREDITS;
    const used = await this.apiUsageService.getUsage(SCRAPER_PROVIDER);
    return { period: used.period, creditsUsed: used.count, cap };
  }

  /// Reads one source and turns whatever it publishes into scraped deals.
  ///
  /// The order of the guards matters: permission before spending, and budget
  /// before fetching. Nothing is requested from a site that told us not to,
  /// and no credit is spent discovering that.
  async runSource(id: string): Promise<ScrapeResult> {
    const source = await this.sourceModel.findById(id);
    if (!source) throw new NotFoundException({ error: 'source_not_found' });
    if (!source.enabled) throw new BadRequestException({ error: 'source_disabled' });

    if (!(await isAllowed(source.url))) {
      // Disabled rather than merely skipped: a site's refusal should not need
      // re-testing on every run, and turning it back on should take a person.
      source.enabled = false;
      return this.finish(source, 'blocked by robots.txt', 0, 0, 0);
    }

    const budget = await this.usage();
    const cost = creditCost(source.renderJs);
    if (budget.creditsUsed + cost > budget.cap) {
      return this.finish(source, `budget reached (${budget.creditsUsed}/${budget.cap})`, 0, 0, 0);
    }

    let html: string;
    let creditsUsed: number;
    try {
      const page = await fetchPage(source.url, source.renderJs);
      html = page.html;
      creditsUsed = page.creditsUsed;
      await this.apiUsageService.increment(SCRAPER_PROVIDER, creditsUsed);
    } catch (e) {
      return this.finish(source, `fetch failed: ${(e as Error).message.slice(0, 120)}`, 0, 0, 0);
    }

    const offers = discountedOnly(extractOffers(html));
    if (offers.length === 0) {
      // Either the site publishes no structured data, or it lists prices with
      // no reductions. Both are "nothing to show", and neither is worth
      // guessing past — see offer-extractor's opening comment.
      return this.finish(source, 'no discounted offers in structured data', 0, 0, creditsUsed);
    }

    const written = await this.writeDeals(source, offers);
    return this.finish(source, `ok: ${written} offers`, offers.length, written, creditsUsed);
  }

  /// Replaces this source's previous deals rather than accumulating them: the
  /// page is the truth, so an offer that has left it should leave Rico too.
  private async writeDeals(source: ScrapeSourceDocument, offers: ExtractedOffer[]): Promise<number> {
    const sourceRefPrefix = `${source._id}:`;
    await this.dealModel.deleteMany({ source: SCRAPED_SOURCE, sourceRef: { $regex: `^${sourceRefPrefix}` } });

    const expiresAt = new Date(Date.now() + SCRAPED_DEAL_TTL_DAYS * 24 * 60 * 60 * 1000);

    const docs = offers.map((offer) => ({
      businessId: source.businessId,
      titleAr: offer.titleAr.slice(0, 120),
      descriptionAr: offer.descriptionAr?.slice(0, 400) ?? null,
      // Always 'fixed' with the new price: the reduction is stated by the
      // shop, not computed by us, so we repeat it rather than deriving a
      // percentage that the page never claimed.
      dealType: 'fixed',
      value: offer.price,
      currency: offer.currency,
      promoCode: null,
      startsAt: null,
      // The hard expiry. A scraped offer nobody re-confirmed removes itself.
      endsAt: expiresAt,
      status: 'active',
      source: SCRAPED_SOURCE,
      // Carries the page it came from, so a shop asking where their offer
      // appeared gets a straight answer, and so removeSource can find them.
      sourceRef: `${sourceRefPrefix}${source.url}`,
      verifiedAt: null,
    }));

    await this.dealModel.insertMany(docs);
    return docs.length;
  }

  private async finish(
    source: ScrapeSourceDocument,
    status: string,
    offersFound: number,
    dealsWritten: number,
    creditsUsed: number,
  ): Promise<ScrapeResult> {
    source.lastScrapedAt = new Date();
    source.lastStatus = status;
    source.lastOfferCount = dealsWritten;
    await source.save();
    return { status, offersFound, dealsWritten, creditsUsed };
  }
}
