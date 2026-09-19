import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { OwnerService } from './owner.service';
import { AccountsService } from '../accounts/accounts.service';
import { OwnerAuditService } from '../owner-audit/owner-audit.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { InviteVendorDto } from './dto/invite-vendor.dto';
import { SessionGuard } from '../common/guards/session.guard';
import { PlatformOwnerGuard } from '../common/guards/platform-owner.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';
import { AccountId } from '../common/decorators/account-id.decorator';
import { CreateBusinessDto } from '../businesses/dto/create-business.dto';
import { CreateDealDto } from '../deals/dto/create-deal.dto';
import { ListBusinessesDto } from './dto/list-businesses.dto';
import { ListVendorsDto } from './dto/list-vendors.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { ReviewClaimStatusDto, ReviewDealStatusDto } from './dto/review-status.dto';
import { AnalyticsQueryDto, ExpiringDealsQueryDto, TopVendorsQueryDto } from './dto/analytics-query.dto';
import { SyncGoogleDto } from './dto/sync-google.dto';
import { ListAuditLogDto } from '../owner-audit/dto/list-audit-log.dto';
import { ProfessionsService } from '../professionals/professions.service';
import { CreateProfessionDto, UpdateProfessionDto } from '../professionals/dto/upsert-profession.dto';

@Controller('owner')
@UseGuards(SessionGuard)
@RequireApp('owner')
export class OwnerController {
  constructor(
    private readonly ownerService: OwnerService,
    private readonly accountsService: AccountsService,
    private readonly ownerAuditService: OwnerAuditService,
    private readonly professionsService: ProfessionsService,
  ) {}

  // ---- Staff (owner-role only) --------------------------------------------

  @UseGuards(PlatformOwnerGuard)
  @Get('staff')
  listStaff() {
    return this.accountsService.listStaff();
  }

  @UseGuards(PlatformOwnerGuard)
  @Post('staff')
  async createStaff(@Body() dto: CreateStaffDto, @AccountId() accountId: string) {
    const created = await this.accountsService.createStaff(dto.email, dto.password, dto.role);
    await this.recordAudit(accountId, 'staff.create', 'Account', String(created.id), { email: created.email, role: created.role });
    return created;
  }

  @UseGuards(PlatformOwnerGuard)
  @Patch('staff/:id')
  async updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffDto, @AccountId() accountId: string) {
    const updated = await this.accountsService.updateStaff(accountId, id, dto);
    await this.recordAudit(accountId, 'staff.update', 'Account', id, dto as Record<string, unknown>);
    return updated;
  }

  // ---- Businesses ----------------------------------------------------------

  @Get('businesses')
  listBusinesses(@Query() query: ListBusinessesDto) {
    return this.ownerService.listBusinesses(query);
  }

  @Get('businesses/export')
  async exportBusinesses(@Res() res: Response) {
    const csv = await this.ownerService.exportBusinessesCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="businesses.csv"');
    res.send(csv);
  }

  @Get('businesses/:id')
  getBusinessDetail(@Param('id') id: string) {
    return this.ownerService.getBusinessDetail(id);
  }

  @Patch('businesses/:id/active')
  async setBusinessActive(@Param('id') id: string, @Body() dto: SetActiveDto, @AccountId() accountId: string) {
    const result = await this.ownerService.setBusinessActive(id, dto.isActive);
    await this.recordAudit(accountId, 'business.setActive', 'Business', id, { isActive: dto.isActive });
    return result;
  }

  @Get('businesses/:id/impressions')
  getBusinessImpressions(@Param('id') id: string, @Query() query: AnalyticsQueryDto) {
    return this.ownerService.getBusinessImpressions(id, query.days ?? 30);
  }

  // ---- Vendors ---------------------------------------------------------------

  @Get('vendors')
  listVendors(@Query() query: ListVendorsDto) {
    return this.ownerService.listVendors(query);
  }

  @Get('vendors/export')
  async exportVendors(@Res() res: Response) {
    const csv = await this.ownerService.exportVendorsCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vendors.csv"');
    res.send(csv);
  }

  @Get('vendors/:id')
  getVendorDetail(@Param('id') id: string) {
    return this.ownerService.getVendorDetail(id);
  }

  @Post('vendors/invite')
  async inviteVendor(@Body() dto: InviteVendorDto, @Req() req: Request, @AccountId() accountId: string) {
    const result = await this.ownerService.inviteVendor(dto.email, dto.businessId);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await this.ownerService.sendVendorInviteEmail(result.email, result.inviteToken, baseUrl);
    await this.recordAudit(accountId, 'vendor.invite', 'Account', String(result.accountId), { email: result.email, businessId: dto.businessId });
    return { accountId: result.accountId, email: result.email };
  }

  // ---- Claim + deal moderation ------------------------------------------------

  @Get('claims/pending')
  getPendingClaims() {
    return this.ownerService.getPendingClaims();
  }

  @Patch('claims/:id/status')
  async reviewClaimStatus(@Param('id') id: string, @Body() dto: ReviewClaimStatusDto, @AccountId() accountId: string) {
    const result = await this.ownerService.reviewClaimStatus(id, dto.status);
    await this.recordAudit(accountId, 'claim.review', 'BusinessClaim', id, { status: dto.status });
    return result;
  }

  @Get('deals/pending')
  getPendingDeals() {
    return this.ownerService.getPendingDeals();
  }

  @Patch('deals/:id/status')
  async reviewDealStatus(@Param('id') id: string, @Body() dto: ReviewDealStatusDto, @AccountId() accountId: string) {
    const result = await this.ownerService.reviewDealStatus(id, dto.status);
    await this.recordAudit(accountId, 'deal.review', 'Deal', id, { status: dto.status });
    return result;
  }

  // ---- Sourcing (manual entry + Google sync) ----------------------------------

  // ملاحظة: نوع الجسم لازم يكون صنف DTO مباشرةً لا نوعاً متقاطعاً — TypeScript
  // يُصدر Object لأي نوع متقاطع، وValidationPipe يتخطّى Object كلياً، فيمرّ
  // الجسم بلا تحقق ولا تنقية. sourceId صار حقلاً على CreateBusinessDto نفسه.
  @Post('sourcing/businesses')
  createBusiness(@Body() dto: CreateBusinessDto) {
    return this.ownerService.createManualBusiness(dto);
  }

  @Post('sourcing/deals')
  createDeal(@Body() dto: CreateDealDto) {
    return this.ownerService.createManualDeal(dto);
  }

  @Post('sourcing/sync-google')
  syncGoogle(@Body() dto: SyncGoogleDto) {
    return this.ownerService.syncGoogle(dto);
  }

  @Get('sourcing/usage')
  getUsage() {
    return this.ownerService.getUsage();
  }

  // ---- Analytics ---------------------------------------------------------------

  @Get('analytics/overview')
  getOverview() {
    return this.ownerService.getOverview();
  }

  @Get('analytics/impressions-trend')
  getImpressionsTrend(@Query() query: AnalyticsQueryDto) {
    return this.ownerService.getImpressionsTrend(query.days ?? 30);
  }

  @Get('analytics/top-vendors')
  getTopVendors(@Query() query: TopVendorsQueryDto) {
    return this.ownerService.getTopVendors(query.days ?? 30, query.limit ?? 10);
  }

  @Get('analytics/category-breakdown')
  getCategoryBreakdown(@Query() query: AnalyticsQueryDto) {
    return this.ownerService.getCategoryBreakdown(query.days ?? 30);
  }

  @Get('analytics/deal-type-performance')
  getDealTypePerformance(@Query() query: AnalyticsQueryDto) {
    return this.ownerService.getDealTypePerformance(query.days ?? 30);
  }

  @Get('analytics/search-gaps')
  getSearchGaps(@Query() query: AnalyticsQueryDto) {
    return this.ownerService.getSearchGaps(query.days ?? 30);
  }

  @Get('analytics/expiring-deals')
  getExpiringDeals(@Query() query: ExpiringDealsQueryDto) {
    return this.ownerService.getExpiringDeals(query.days ?? 7);
  }

  @Get('analytics/claim-funnel')
  getClaimFunnel() {
    return this.ownerService.getClaimFunnel();
  }

  @Get('analytics/vendor-activity')
  getVendorActivity() {
    return this.ownerService.getVendorActivity();
  }

  @Get('analytics/snapshot-summary')
  async getSnapshotSummary(@Query() query: AnalyticsQueryDto) {
    return { summary: await this.ownerService.getSnapshotSummary(query.days ?? 30) };
  }

  // ---- Professions ----------------------------------------------------------
  // The trades the app offers. They used to be a constant in the source, so
  // adding "فني ألواح شمسية" because three people asked for it meant a
  // release; they are rows now, and this is where they are edited. Every
  // change is audited like the rest of the dashboard's writes — the list
  // decides who is findable in the app, so "who added that" has to be
  // answerable.

  @Get('professions')
  listProfessions() {
    return this.professionsService.listForOwner();
  }

  @Post('professions')
  async createProfession(@Body() dto: CreateProfessionDto, @AccountId() accountId: string) {
    const created = await this.professionsService.create(dto);
    await this.recordAudit(accountId, 'profession.create', 'Profession', created.slug, {
      label: created.label,
      group: created.group,
    });
    return created;
  }

  @Patch('professions/:slug')
  async updateProfession(
    @Param('slug') slug: string,
    @Body() dto: UpdateProfessionDto,
    @AccountId() accountId: string,
  ) {
    const updated = await this.professionsService.update(slug, dto);
    await this.recordAudit(accountId, 'profession.update', 'Profession', slug, dto as Record<string, unknown>);
    return updated;
  }

  // Refused while anyone still offers the trade — see
  // ProfessionsService.remove. Deactivating is the reversible answer.
  @Delete('professions/:slug')
  async removeProfession(@Param('slug') slug: string, @AccountId() accountId: string) {
    const result = await this.professionsService.remove(slug);
    await this.recordAudit(accountId, 'profession.delete', 'Profession', slug, {});
    return result;
  }

  // ---- Audit log -----------------------------------------------------------

  @Get('audit-log')
  listAuditLog(@Query() query: ListAuditLogDto) {
    return this.ownerAuditService.list(query.page ?? 1, query.limit ?? 30);
  }

  private async recordAudit(
    accountId: string,
    action: string,
    targetType: string,
    targetId: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    const { email } = await this.accountsService.me(accountId);
    await this.ownerAuditService.record({ ownerId: accountId, ownerEmail: email, action, targetType, targetId, detail });
  }
}
