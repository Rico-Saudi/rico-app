// Grades the keyword fallback against the agent corpus
// (scripts/agent-corpus/*.jsonl): messages written by persona agents, each
// with the answer a person would expect. Shared by the spec, which holds the
// line, and scripts/eval-fallback.ts, which prints every miss.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Intent } from '../intent-validation';
import { normalizeArabic } from '../../learning/constants/normalize';

export interface CorpusLine {
  file: string;
  msg: string;
  dialect: string;
  /** "place:<slug>" | "other:<value>:<label>" | "pro:<slug>" | "deals" |
   * "order" | "chat", several joined by " + ". */
  expect: string;
  /** For order lines: what the basket should hold (see the agents' guide). */
  order?: ExpectedOrder;
  /** Conversation lines: what came before the message. */
  history?: { role: 'user' | 'assistant'; content: string }[];
  lastResults?: { label: string; items: { position: number; name: string }[] } | null;
  /** For a refinement ("في ارخص؟"), the rank it asks for. */
  rank?: string | null;
  /** For "التاني", the list position it points at. */
  position?: number | null;
}

export interface ExpectedOrder {
  placeName: string | null;
  category: string | null;
  position: number | null;
  items: { name: string; quantity: number }[];
}

export type Grade = 'pass' | 'partial' | 'miss' | 'wrong' | 'false_positive';

export function loadCorpus(dir: string): CorpusLine[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .flatMap((file) =>
      readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => ({ file, ...JSON.parse(l) })),
    );
}

// Two answers a reasonable person would accept as the same search. The
// agents named these places independently, so the same need sometimes came
// back under two names.
const SAME: string[][] = [
  ['other:wedding_hall', 'other:event_hall'],
  ['other:perfume_shop', 'other:perfume_store', 'place:cosmetics'],
  ['other:print_shop', 'other:printing_shop'],
  ['other:stationery_store', 'place:bookstore'],
  ['other:istiraha', 'other:chalet', 'other:farm'],
  [
    'place:hardware_store',
    'other:building_materials',
    'other:paint_store',
    'other:tile_store',
    'other:plumbing_supply',
    'other:electrical_supplies',
  ],
  ['other:furnished_apartments', 'place:hotel'],
  ['other:physiotherapy_center', 'pro:physiotherapist'],
  ['other:chocolate_shop', 'place:sweets', 'place:bakery'],
  ['other:nail_salon', 'other:laser_clinic', 'place:beauty'],
  ['other:nutrition_clinic', 'place:clinic'],
  ['other:computer_store', 'place:electronics'],
  ['other:courthouse', 'other:notary', 'other:embassy', 'place:government_office'],
  ['other:prayer_room', 'place:mosque'],
  ['other:bowling', 'other:karting', 'other:escape_room', 'other:playground', 'place:amusement'],
  ['other:wedding_decor', 'pro:event_planner', 'other:event_planning_company'],
  ['other:coffee_roastery', 'other:roastery'],
  ['other:tire_shop', 'pro:tire_service'],
  ['other:courier', 'place:post_office'],
  ['other:spa', 'other:turkish_bath'],
  ['pro:drain_cleaning', 'pro:plumber', 'pro:leak_detection'],
  ['pro:refrigeration', 'pro:appliance_repair'],
  ['pro:ac_cleaning', 'pro:ac_technician'],
  ['other:telecom_store', 'place:mobile_phone'],
  ['other:taxi_stand', 'pro:driver'],
  ['place:maintenance_centre', 'place:appliance_repair'],
  ['other:locksmith', 'pro:door_installer'],
  ['other:party_rentals', 'other:tent_rental', 'pro:tent_installer'],
  ['other:water_delivery', 'other:water_tanker'],
  ['other:scrapyard', 'place:auto_parts'],
  ['other:catering', 'pro:chef'],
  ['other:zaffa_band', 'pro:sound_lighting'],
  ['other:vehicle_inspection', 'place:government_office'],
  // Added after the held-out round: the same need under the names the
  // second set of agents chose.
  ['other:istiraha', 'other:rest_house', 'other:rest_house_rental', 'other:chalet'],
  ['other:vegetable_market', 'other:greengrocer'],
  ['other:sports_field', 'other:football_pitch', 'other:padel_court'],
  ['other:bowling_alley', 'place:amusement'],
  ['other:gas_cylinders', 'other:gas_distributor'],
  ['other:hajj_umrah_office', 'place:travel_agency'],
  ['other:perfume_shop', 'other:oud_incense_shop'],
  ['other:quran_memorization_center', 'pro:quran_teacher'],
  ['place:tailor', 'pro:tailor'],
  ['other:party_supplies', 'other:ramadan_decorations_shop'],
  ['other:watch_store', 'other:watch_shop'],
  // Transport round.
  ['other:visa_office', 'place:travel_agency'],
  ['other:luggage_shop', 'other:bag_store'],
  ['other:delivery_company', 'other:courier', 'pro:driver'],
  ['other:castle', 'other:tourist_attraction', 'other:museum'],
  ['other:bridal_shop', 'other:suit_rental', 'place:clothes'],
  ['place:phone_repair', 'pro:phone_repair'],
  ['other:furnished_apartments', 'place:real_estate'],
];

// Words in a free-place slug that say what kind of business, not what it
// sells — "juice_bar" and "juice_shop" are the same search.
const GENERIC = new Set(['shop', 'store', 'bar', 'center', 'centre', 'office', 'market', 'seller', 'distributor', 'alley', 'court', 'pitch', 'rental', 'house', 'stop']);

function sameFreePlace(a: string, b: string): boolean {
  if (!a.startsWith('other:') || !b.startsWith('other:')) return false;
  const words = (k: string) => k.slice(6).split('_').filter((w) => !GENERIC.has(w));
  const wa = words(a);
  return words(b).some((w) => wa.includes(w));
}

/** Strict: the same slug, or a pair listed in SAME. Lenient (the default)
 * also accepts two free-place slugs naming the same thing in other words
 * ("ice_cream" / "ice_cream_shop"), since both send Google the same label. */
export function same(a: string, b: string, lenient = true): boolean {
  return a === b || SAME.some((g) => g.includes(a) && g.includes(b)) || (lenient && sameFreePlace(a, b));
}

function expectedKey(part: string): string {
  const p = part.trim();
  if (p.startsWith('other:')) return p.split(':').slice(0, 2).join(':');
  return p;
}

export function intentKey(i: Intent): string {
  switch (i.kind) {
    case 'deals':
      return 'deals';
    case 'order':
      return 'order';
    case 'professional':
      return `pro:${i.profession}`;
    default:
      return i.category === 'other' ? `other:${i.customTag?.value}` : `place:${i.category}`;
  }
}

export function grade(expect: string, intents: Intent[]): Grade {
  const want = expect.split('+').map(expectedKey);
  const got = intents.map(intentKey);

  // "order + chat": an order and a question Rico answers in words. Only an
  // all-chat line forbids a search; otherwise the chat part is left to the reply.
  if (want.includes('chat') && want.length > 1) want.splice(want.indexOf('chat'), 1);
  if (want.includes('chat')) return got.length ? 'false_positive' : 'pass';
  if (!got.length) return 'miss';

  const found = want.filter((w) => got.some((g) => same(w, g)));
  const extra = got.filter((g) => !want.some((w) => same(w, g)));
  if (found.length === want.length && !extra.length) return 'pass';
  if (found.length) return 'partial';
  return 'wrong';
}

const PLURAL_CONTAINERS: Record<string, string> = { قطع: 'قطعه', صحون: 'صحن', قناني: 'قنينه', علب: 'علبه', ربطات: 'ربطه', اكياس: 'كيس', كراتين: 'كرتون' };

// ─── Orders ──────────────────────────────────────────────────────────────

/** Two spellings of one shop or dish: the same words once folded, "ال" and
 * order aside, or one contained in the other ("البيك" / "مطعم البيك"). */
function sameName(a: string, b: string): boolean {
  const words = (s: string) =>
    normalizeArabic(s)
      .split(' ')
      .map((w) => w.replace(/^(?:وال|بال|ال|و)/u, ''))
      // "قطع"/"قطعة", "صحون"/"صحن": a container counted either way.
      .map((w) => PLURAL_CONTAINERS[w] ?? w)
      .filter((w) => w && w !== 'من' && w !== 'مطعم' && w !== 'محل');
  const wa = words(a).join(' ');
  const wb = words(b).join(' ');
  if (!wa || !wb) return normalizeArabic(a) === normalizeArabic(b);
  if (wa === wb || wa.includes(wb) || wb.includes(wa)) return true;
  // Same words in another order ("موز كيلو" / "كيلو موز").
  const sa = new Set(wa.split(' '));
  const sb = new Set(wb.split(' '));
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  return [...small].every((w) => big.has(w));
}

export interface OrderGrade {
  /** An order intent came back at all. */
  found: boolean;
  /** It points at the right shop: by name, by kind, or by list position. */
  shop: boolean;
  /** Every expected item is there with its quantity, and nothing else. */
  items: boolean;
}

export function gradeOrder(expected: ExpectedOrder, intents: Intent[]): OrderGrade {
  const got = intents.find((i) => i.kind === 'order');
  if (!got) return { found: false, shop: false, items: false };

  let shop: boolean;
  if (expected.position) shop = got.referencedPosition === expected.position;
  else if (expected.placeName) shop = !!got.placeName && sameName(expected.placeName, got.placeName);
  else shop = !got.placeName && got.referencedPosition === null && (!expected.category || got.category === expected.category);

  const gotItems = got.orderItems ?? [];
  const items =
    gotItems.length === expected.items.length &&
    expected.items.every((e) => gotItems.some((g) => sameName(e.name, g.name) && g.quantity === e.quantity));

  return { found: true, shop, items };
}

/** Whether a refinement or a pointer landed: the place intent carries the
 * rank or the list position the line asks for. Lines without either pass. */
export function gradeFollowUp(line: CorpusLine, intents: Intent[]): boolean {
  const place = intents.find((i) => i.kind === 'place' || i.kind === 'professional');
  // A trade search has no rank to set (validateIntent fixes it to nearest), so
  // only a place is held to the rank asked for.
  if (line.rank && line.rank !== 'nearest' && place?.kind === 'place' && place.rank !== line.rank) return false;
  if (line.position && !line.expect.includes('order') && place?.referencedPosition !== line.position) return false;
  return true;
}
