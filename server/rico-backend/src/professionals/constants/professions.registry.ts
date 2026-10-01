import { PROFESSIONS, PROFESSION_GROUPS, Profession } from './professions';
import { normalizeArabic, similarity } from '../../public/order-matching.util';

/**
 * The live profession list.
 *
 * The trades used to be a compile-time constant. They are now rows the
 * platform owner edits from the dashboard, so every part of the server that
 * used to `import { PROFESSION_SLUGS }` reads them from here instead — a
 * trade added in the dashboard has to be valid in the search DTO, nameable
 * by `professionLabel`, and resolvable by `resolveProfession` *within the
 * same process*, without a redeploy.
 *
 * `constants/professions.ts` stays as the seed the collection is created
 * from, and as what this registry holds before the first DB read (and if
 * that read ever fails) — so a Mongo hiccup degrades to the list we shipped
 * rather than to an empty catalogue that rejects every search.
 */
// `group` widens to a plain string here, unlike the seed's union type: the
// rows come from a collection the owner writes to, and a group slug that
// went stale has to be *representable* so it can be read back and fixed —
// not a type error that stops the list loading.
export interface ProfessionEntry extends Omit<Profession, 'group'> {
  group: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ProfessionGroupView {
  slug: string;
  label: string;
  professions: { slug: string; label: string }[];
}

class ProfessionRegistry {
  private entries: ProfessionEntry[] = [];
  private bySlug = new Map<string, ProfessionEntry>();
  private groupLabels = new Map<string, string>(PROFESSION_GROUPS.map((g) => [g.slug, g.label]));

  /** Bumped on every replace. Callers that derive something expensive from
   * the list (the classifier prompt) memoize against it. */
  version = 0;

  constructor() {
    this.replaceAll(PROFESSIONS.map((p, i) => ({ ...p, isActive: true, sortOrder: i })));
  }

  /** Called by ProfessionsService after every read or write of the
   * collection. A replace is atomic from a caller's point of view: the maps
   * are rebuilt off to the side and swapped in together. */
  replaceAll(rows: ProfessionEntry[]): void {
    const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
    this.entries = sorted;
    this.bySlug = new Map(sorted.map((p) => [p.slug, p]));
    this.version++;
  }

  all(): ProfessionEntry[] {
    return this.entries;
  }

  active(): ProfessionEntry[] {
    return this.entries.filter((p) => p.isActive);
  }

  get(slug: string): ProfessionEntry | null {
    return this.bySlug.get(slug) ?? null;
  }

  /** Whether the app may search or store this slug. Deactivated trades stay
   * *known* on purpose: someone whose trade was switched off keeps a valid
   * profile and a working label — they just stop being offered in the
   * picker. Only removal makes a slug unknown. */
  has(slug: unknown): slug is string {
    return typeof slug === 'string' && this.bySlug.has(slug);
  }

  /** The Arabic name, or the slug itself for a trade deleted from the list —
   * an old profile keeps working, it just shows an unpolished label rather
   * than blanking out. */
  label(slug: string): string {
    return this.bySlug.get(slug)?.label ?? slug;
  }

  /** Group slugs the dashboard offers, in display order. */
  groups(): { slug: string; label: string }[] {
    return [...this.groupLabels].map(([slug, label]) => ({ slug, label }));
  }

  groupLabel(slug: string): string {
    return this.groupLabels.get(slug) ?? slug;
  }

  hasGroup(slug: unknown): slug is string {
    return typeof slug === 'string' && this.groupLabels.has(slug);
  }

  /** Active trades grouped for the picker, empty groups dropped — an owner
   * who switches off every trade in a group shouldn't leave a bare heading
   * in the app. */
  byGroup(): ProfessionGroupView[] {
    return this.groups()
      .map((group) => ({
        slug: group.slug,
        label: group.label,
        professions: this.active()
          .filter((p) => p.group === group.slug)
          .map(({ slug, label }) => ({ slug, label })),
      }))
      .filter((g) => g.professions.length > 0);
  }
}

export const professionRegistry = new ProfessionRegistry();

// ─── The shapes the rest of the server already imported ────────────────────
// Kept as free functions with their old names and semantics so call sites
// read the same; only their source of truth moved.

export function professionLabel(slug: string): string {
  return professionRegistry.label(slug);
}

export function isKnownProfession(slug: unknown): slug is string {
  return professionRegistry.has(slug);
}

export function professionsByGroup(): ProfessionGroupView[] {
  return professionRegistry.byGroup();
}

/**
 * كلمات تعني مهنة مختلفة باختلاف السوق.
 *
 * "سمكري" بالأردن والشام = سبّاك، وبالسعودية = سمكري سيارات. والقائمة
 * مكتوبة بالسعودي، فبلا هذا الجدول يوصل طلب «عندي تسريب مي» لمصلّح
 * هياكل سيارات — وهذا مو تقريب غلط، هو مهنة ثانية تماماً.
 *
 * تُفحص قبل أي مطابقة: الكلمة صريحة عند صاحبها، والتشابه ما له رأي هنا.
 */
const DIALECT_OVERRIDES: Record<string, Record<string, string>> = {
  jordanian: {
    سمكري: 'plumber',
    سمكرجي: 'plumber',
    مواسرجي: 'plumber',
  },
};

/** أقل تشابه نقبله بين ما نطقه العميل واسم مهنة معتمدة.
 *
 * أعلى من عتبة مطابقة الأصناف: أسماء المهن قصيرة ومتقاربة ("دهّان" و"نجّار"
 * و"حدّاد")، وإرسال طلب لصاحب مهنة غلط أسوأ بكثير من الاعتراف إن المهنة ما
 * هي متوفرة. الصيغ الحقيقية تعدّيها بسهولة: "دهان"→"دهّان" تطلع ١٫٠ بعد
 * التطبيع، و"كهربجي"→"كهربائي" تطلع ٠٫٧٣.
 */
const PROFESSION_MATCH_THRESHOLD = 0.7;

/**
 * يحوّل اسم مهنة عربي كما نطقه العميل إلى سلوق معتمد، أو null.
 *
 * وُجدت لتخرج قائمة المهن الـ١٠٦ من برومبت المصنّف: كانت تُحقن كاملة بكل
 * رسالة (٣ آلاف حرف) عشان النموذج يختار السلوق بنفسه، فدفعت البرومبت فوق
 * سقف الحساب على Groq وصار **كل** نداء تصنيف يفشل. الحين النموذج يرجّع
 * الاسم العربي زي ما سمعه، والخادم — اللي يملك القائمة أصلاً ويعرف متى
 * تتغيّر — يحلّه هنا.
 *
 * يقبل السلوق الإنجليزي كما هو أيضاً، عشان نموذج يرجّع "painter" ما ينكسر.
 */
export function resolveProfession(spoken: unknown, dialect?: string): string | null {
  if (typeof spoken !== 'string') return null;
  const raw = spoken.trim();
  if (!raw || raw.length > 60) return null;

  // سلوق معتمد وصل كما هو — ما يحتاج تخميناً.
  if (professionRegistry.has(raw)) return raw;

  const normalized = normalizeArabic(raw);
  if (!normalized) return null;

  // كلمة تعني مهنة ثانية بهذا السوق — تحسمها اللهجة لا التشابه.
  const override = dialect ? DIALECT_OVERRIDES[dialect]?.[normalized] : undefined;
  if (override && professionRegistry.has(override)) return override;

  let best: { slug: string; score: number } | null = null;
  for (const entry of professionRegistry.active()) {
    // aliases هي «كيف يكتبها الناس فعلاً» — كانت للمطابقة دون اتصال وحدها،
    // وصارت هنا المصدر الأهم: النموذج يرجّع كلام العميل لا اسم القائمة،
    // فـ«كهربجي» توصل كما هي و«كهربائي» ما تشبهها إلا ٠٫٧٣.
    const score = Math.max(
      similarity(raw, entry.label),
      similarity(raw, entry.slug),
      ...entry.aliases.map((a) => similarity(raw, a)),
    );
    if (score > (best?.score ?? 0)) best = { slug: entry.slug, score };
  }

  return best && best.score >= PROFESSION_MATCH_THRESHOLD ? best.slug : null;
}

let promptLinesCache = { version: -1, lines: '' };

/** One line per group, for the **training** prompt: it reads Arabic names
 * and answers with slugs, so it needs both, and the grouping helps it pick
 * the right neighbour among 100+ similar trades.
 *
 * No longer used by the classifier. Injecting all 106 trades into every
 * classify call is what pushed that prompt past the account's Groq limit and
 * made every call fail; the classifier now sends back the Arabic name and
 * [resolveProfession] maps it here. Training is a batch job with no such
 * budget, so it still gets the full list.
 *
 * Built on demand rather than at import time — the list can change while the
 * process is running, and a prompt frozen at boot would be blind to a trade
 * the owner added an hour ago. Memoized on the registry version so the
 * string is still built once per edit, not once per message.
 */
export function professionPromptLines(): string {
  if (promptLinesCache.version !== professionRegistry.version) {
    promptLinesCache = {
      version: professionRegistry.version,
      lines: professionRegistry
        .byGroup()
        .map((g) => `${g.label}: ${g.professions.map((p) => `${p.label}=${p.slug}`).join('، ')}`)
        .join('\n'),
    };
  }
  return promptLinesCache.lines;
}
