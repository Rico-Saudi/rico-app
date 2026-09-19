import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProfessionEntry, ProfessionEntryDocument } from './schemas/profession.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { PROFESSIONS } from './constants/professions';
import { professionRegistry } from './constants/professions.registry';
import { CreateProfessionDto, UpdateProfessionDto } from './dto/upsert-profession.dto';

/**
 * Owns the trades collection: seeds it, keeps the in-process registry in
 * step with it, and serves the dashboard's CRUD.
 *
 * Every write goes through `refresh()` before it returns, so the moment the
 * owner saves a new trade it is already valid in the search DTO, nameable by
 * `professionLabel`, and present in the classifier prompt — in this process.
 * Other instances pick it up on their next refresh; a stale one is harmless
 * (it just doesn't offer the new trade yet), which is why this is a reload
 * rather than a broadcast.
 */
@Injectable()
export class ProfessionsService implements OnModuleInit {
  private readonly logger = new Logger(ProfessionsService.name);

  constructor(
    @InjectModel(ProfessionEntry.name) private readonly professionModel: Model<ProfessionEntryDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedIfEmpty();
      await this.refresh();
    } catch (error) {
      // Boot must not depend on this: the registry already holds the
      // shipped list, so the server comes up serving the trades we shipped
      // rather than refusing to start over a slow first connection.
      this.logger.warn(`profession list not loaded, using the built-in seed: ${error}`);
    }
  }

  /** First run on a fresh database. Not an upsert-every-boot: once the
   * collection exists it belongs to the dashboard, and re-seeding would
   * undo an owner's edits (or resurrect a trade they deleted) on every
   * deploy. */
  private async seedIfEmpty(): Promise<void> {
    if ((await this.professionModel.estimatedDocumentCount()) > 0) return;
    await this.professionModel.insertMany(
      PROFESSIONS.map((p, i) => ({ ...p, isActive: true, sortOrder: i })),
      { ordered: false },
    );
    this.logger.log(`seeded ${PROFESSIONS.length} professions`);
  }

  async refresh(): Promise<void> {
    const rows = await this.professionModel.find().lean();
    // An empty read is treated as "nothing to say" rather than "no trades
    // exist": replacing the registry with [] would make every search and
    // every profile save fail validation.
    if (!rows.length) return;
    professionRegistry.replaceAll(
      rows.map((r) => ({
        slug: r.slug,
        label: r.label,
        group: r.group,
        aliases: r.aliases ?? [],
        isActive: r.isActive !== false,
        sortOrder: r.sortOrder ?? 0,
      })),
    );
  }

  // ─── What the app reads ──────────────────────────────────────────────────

  /** The picker's list. Served rather than hardcoded in the app so a trade
   * the owner adds reaches builds already on people's phones.
   *
   * `professions` stays alongside `groups` for clients built before grouping
   * existed — they render the flat list exactly as they did. */
  listProfessions() {
    const groups = professionRegistry.byGroup();
    return {
      groups,
      professions: groups.flatMap((g) => g.professions.map((p) => ({ ...p, group: g.slug }))),
    };
  }

  // ─── What the dashboard reads and writes ─────────────────────────────────

  /** Everything, inactive included, each row carrying how many people
   * currently offer it — the number that decides whether a trade can be
   * deleted or should only be switched off. */
  async listForOwner() {
    const [rows, usage] = await Promise.all([
      this.professionModel.find().sort({ sortOrder: 1, slug: 1 }).lean(),
      this.customerModel.aggregate<{ _id: string; count: number }>([
        { $match: { 'professional.profession': { $ne: null } } },
        { $group: { _id: '$professional.profession', count: { $sum: 1 } } },
      ]),
    ]);

    const counts = new Map(usage.map((u) => [u._id, u.count]));

    return {
      groups: professionRegistry.groups(),
      items: rows.map((r) => ({
        slug: r.slug,
        label: r.label,
        group: r.group,
        groupLabel: professionRegistry.groupLabel(r.group),
        aliases: r.aliases ?? [],
        isActive: r.isActive !== false,
        sortOrder: r.sortOrder ?? 0,
        professionalCount: counts.get(r.slug) ?? 0,
      })),
    };
  }

  async create(dto: CreateProfessionDto) {
    if (!professionRegistry.hasGroup(dto.group)) {
      throw new BadRequestException({ error: 'group_unknown', groups: professionRegistry.groups() });
    }
    if (await this.professionModel.exists({ slug: dto.slug })) {
      throw new ConflictException({ error: 'profession_exists' });
    }

    // New trades go to the end of their group by default rather than to
    // position 0, so adding one doesn't reshuffle a picker people know.
    const last = await this.professionModel.findOne().sort({ sortOrder: -1 }).lean();

    const created = await this.professionModel.create({
      slug: dto.slug,
      label: dto.label.trim(),
      group: dto.group,
      aliases: this.cleanAliases(dto.aliases),
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 1,
    });

    await this.refresh();
    return this.toOwnerRow(created, 0);
  }

  async update(slug: string, dto: UpdateProfessionDto) {
    if (dto.group !== undefined && !professionRegistry.hasGroup(dto.group)) {
      throw new BadRequestException({ error: 'group_unknown', groups: professionRegistry.groups() });
    }

    const updated = await this.professionModel.findOneAndUpdate(
      { slug },
      {
        $set: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.group !== undefined ? { group: dto.group } : {}),
          ...(dto.aliases !== undefined ? { aliases: this.cleanAliases(dto.aliases) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException({ error: 'profession_not_found' });

    await this.refresh();
    return this.toOwnerRow(updated, await this.customerModel.countDocuments({ 'professional.profession': slug }));
  }

  /** Refused while anyone still offers the trade: their profile stores this
   * slug, and deleting it would leave them findable under a name nothing
   * can resolve. Switching it off is the reversible answer, and the error
   * says so with the number. */
  async remove(slug: string) {
    const inUse = await this.customerModel.countDocuments({ 'professional.profession': slug });
    if (inUse > 0) {
      throw new ConflictException({ error: 'profession_in_use', professionalCount: inUse });
    }

    const deleted = await this.professionModel.findOneAndDelete({ slug });
    if (!deleted) throw new NotFoundException({ error: 'profession_not_found' });

    await this.refresh();
    return { slug, deleted: true };
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private cleanAliases(aliases: string[] | undefined): string[] {
    if (!aliases) return [];
    const seen = new Set<string>();
    for (const raw of aliases) {
      const alias = raw.trim();
      if (alias) seen.add(alias);
    }
    return [...seen];
  }

  private toOwnerRow(row: ProfessionEntryDocument, professionalCount: number) {
    return {
      slug: row.slug,
      label: row.label,
      group: row.group,
      groupLabel: professionRegistry.groupLabel(row.group),
      aliases: row.aliases ?? [],
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      professionalCount,
    };
  }
}
