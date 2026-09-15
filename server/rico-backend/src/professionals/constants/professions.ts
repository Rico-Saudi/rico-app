// The trades a person can put on their profile ("أنا دهّان") and that a
// customer can ask for in chat ("أبغى دهان قريب مني").
//
// This is the one list: the classifier prompt names these slugs, the search
// endpoint filters by them, the profile picker renders them grouped by
// `group`, and Flutter's offline keyword fallback mirrors them
// (lib/services/profession_catalog.dart) — any trade added here belongs there
// too, or the local fallback silently stops recognizing it when the
// classifier is unreachable.
//
// `aliases` are what people actually type. They exist for the keyword
// fallback and for nothing else — the LLM classifier doesn't need them, it
// reads the Arabic label.
//
// An alias must never be a word that already means a PLACE (see Flutter's
// IntentService._categories): "عفش" is a furniture shop and "ميكانيكي" is a
// garage, so claiming those here would make the offline fallback answer a
// question about a shop with a list of people. Qualified phrasings are how a
// colliding trade stays reachable — "حلاق منزلي", not "حلاق". The Dart test
// "لا تتصادم أسماء المهن مع كلمات فئات الأماكن" enforces this.

export interface Profession {
  /** Stable id. Never renamed: it is stored on customer profiles. */
  slug: string;
  /** Arabic name shown to users and sent to the reply writer. */
  label: string;
  /** Which section of the picker it appears under. */
  group: ProfessionGroupSlug;
  /** Common ways people write it, for the offline keyword fallback. */
  aliases: string[];
}

export const PROFESSION_GROUPS = [
  { slug: 'construction', label: 'البناء والمقاولات' },
  { slug: 'electrical', label: 'الكهرباء والتكييف' },
  { slug: 'plumbing', label: 'السباكة والمياه' },
  { slug: 'carpentry', label: 'النجارة والأثاث' },
  { slug: 'metalwork', label: 'الحدادة والألمنيوم' },
  { slug: 'finishing', label: 'التشطيب والديكور' },
  { slug: 'maintenance', label: 'الصيانة والتركيب' },
  { slug: 'cleaning', label: 'النظافة والمكافحة' },
  { slug: 'vehicles', label: 'السيارات والنقل' },
  { slug: 'tech', label: 'التقنية والإلكترونيات' },
  { slug: 'personal', label: 'خدمات شخصية' },
  { slug: 'care', label: 'التعليم والرعاية' },
  { slug: 'food', label: 'الطعام والمناسبات' },
  { slug: 'professional', label: 'خدمات مهنية' },
] as const;

export type ProfessionGroupSlug = (typeof PROFESSION_GROUPS)[number]['slug'];

export const PROFESSIONS: Profession[] = [
  // ── البناء والمقاولات ────────────────────────────
  { slug: 'mason', label: 'بنّاء', group: 'construction', aliases: ['بنّاء', 'معلم بناء', 'بلوك', 'طابوق', 'بناء جدار'] },
  { slug: 'contractor', label: 'مقاول', group: 'construction', aliases: ['مقاول', 'مقاولات', 'مقاول بناء', 'مقاول تشطيب'] },
  { slug: 'concrete_worker', label: 'فني صبّ خرسانة', group: 'construction', aliases: ['صب خرسانة', 'خرسانة', 'صبة', 'مضخة خرسانة'] },
  { slug: 'steel_fixer', label: 'حدّاد مسلّح', group: 'construction', aliases: ['حداد مسلح', 'تسليح', 'حديد تسليح'] },
  { slug: 'surveyor', label: 'مسّاح', group: 'construction', aliases: ['مساح', 'مساحة أراضي', 'رفع مساحي'] },
  { slug: 'civil_engineer', label: 'مهندس مدني', group: 'construction', aliases: ['مهندس مدني', 'هندسة مدنية', 'إشراف هندسي'] },
  { slug: 'architect', label: 'مهندس معماري', group: 'construction', aliases: ['مهندس معماري', 'معماري', 'تصميم معماري', 'مخططات'] },
  { slug: 'demolition', label: 'فني هدم وتكسير', group: 'construction', aliases: ['هدم', 'تكسير', 'هدم جدار'] },
  { slug: 'excavator_operator', label: 'سائق حفّار', group: 'construction', aliases: ['حفار', 'شيول', 'بوبكات', 'حفر أساسات'] },
  { slug: 'scaffolder', label: 'فني سقالات', group: 'construction', aliases: ['سقالات', 'شدة معدنية'] },
  { slug: 'roofer', label: 'فني أسطح', group: 'construction', aliases: ['ترميم سطح', 'أسطح', 'ترميم سقف'] },
  { slug: 'well_driller', label: 'فني حفر آبار', group: 'construction', aliases: ['حفر آبار', 'بئر', 'آبار'] },
  // ── الكهرباء والتكييف ────────────────────────────
  { slug: 'electrician', label: 'كهربائي', group: 'electrical', aliases: ['كهربائي', 'كهربجي', 'فني كهرباء', 'تمديدات كهرباء', 'لوحة كهرباء'] },
  { slug: 'ac_technician', label: 'فني تكييف', group: 'electrical', aliases: ['تكييف', 'مكيف', 'مكيفات', 'فني مكيفات', 'سبليت', 'صيانة مكيفات'] },
  { slug: 'central_ac', label: 'فني تكييف مركزي', group: 'electrical', aliases: ['تكييف مركزي', 'دكت', 'مجاري هواء'] },
  { slug: 'refrigeration', label: 'فني تبريد', group: 'electrical', aliases: ['تبريد', 'غرف تبريد', 'فريزر', 'ثلاجة عرض'] },
  { slug: 'generator_technician', label: 'فني مولدات', group: 'electrical', aliases: ['مولدات', 'مولد كهرباء', 'جنريتر'] },
  { slug: 'solar_technician', label: 'فني طاقة شمسية', group: 'electrical', aliases: ['طاقة شمسية', 'ألواح شمسية', 'سخان شمسي'] },
  { slug: 'elevator_technician', label: 'فني مصاعد', group: 'electrical', aliases: ['مصاعد', 'مصعد', 'أسانسير'] },
  { slug: 'low_current', label: 'فني تيار خفيف', group: 'electrical', aliases: ['تيار خفيف', 'انتركم', 'إنتركم'] },
  { slug: 'cctv', label: 'فني كاميرات مراقبة', group: 'electrical', aliases: ['كاميرات', 'كاميرات مراقبة', 'مراقبة'] },
  { slug: 'alarm_systems', label: 'فني أنظمة إنذار', group: 'electrical', aliases: ['إنذار', 'انذار حريق', 'أنظمة إنذار'] },
  { slug: 'fire_safety', label: 'فني أنظمة إطفاء', group: 'electrical', aliases: ['إطفاء', 'طفايات', 'رشاشات حريق'] },
  { slug: 'smart_home', label: 'فني منازل ذكية', group: 'electrical', aliases: ['منزل ذكي', 'سمارت هوم', 'أتمتة منزل'] },
  { slug: 'satellite_technician', label: 'فني ستلايت', group: 'electrical', aliases: ['ستلايت', 'دش', 'رسيفر'] },
  // ── السباكة والمياه ────────────────────────────────
  { slug: 'plumber', label: 'سبّاك', group: 'plumbing', aliases: ['سباك', 'سبّاك', 'فني صحي', 'مواسير', 'تمديدات صحية'] },
  { slug: 'drain_cleaning', label: 'فني تسليك مجاري', group: 'plumbing', aliases: ['تسليك', 'مجاري', 'بيارة', 'شفط بيارات'] },
  { slug: 'leak_detection', label: 'فني كشف تسربات', group: 'plumbing', aliases: ['كشف تسربات', 'تسرب مياه', 'تسريب مياه'] },
  { slug: 'water_tank_cleaning', label: 'فني تنظيف خزانات', group: 'plumbing', aliases: ['تنظيف خزان', 'خزانات', 'غسيل خزان', 'عزل خزانات'] },
  { slug: 'water_pump', label: 'فني مضخات مياه', group: 'plumbing', aliases: ['مضخة مياه', 'دينمو مياه', 'طرمبة'] },
  { slug: 'water_filter', label: 'فني فلاتر مياه', group: 'plumbing', aliases: ['فلتر مياه', 'فلاتر', 'محطة تحلية'] },
  // ── النجارة والأثاث ────────────────────────────────
  { slug: 'carpenter', label: 'نجّار', group: 'carpentry', aliases: ['نجار', 'نجّار', 'نجارة', 'تفصيل خشب'] },
  { slug: 'furniture_assembly', label: 'فني تركيب أثاث', group: 'carpentry', aliases: ['تركيب أثاث', 'فك وتركيب', 'تركيب غرف نوم'] },
  { slug: 'kitchen_installer', label: 'فني تركيب مطابخ', group: 'carpentry', aliases: ['تركيب مطابخ', 'مطبخ', 'مطابخ'] },
  { slug: 'door_installer', label: 'فني تركيب أبواب', group: 'carpentry', aliases: ['تركيب أبواب', 'أبواب', 'تركيب باب'] },
  { slug: 'upholsterer', label: 'منجّد', group: 'carpentry', aliases: ['منجد', 'تنجيد', 'تنجيد كنب'] },
  { slug: 'curtain_installer', label: 'فني تركيب ستائر', group: 'carpentry', aliases: ['ستائر', 'تركيب ستارة', 'ستارة'] },
  // ── الحدادة والألمنيوم ──────────────────────────
  { slug: 'blacksmith', label: 'حدّاد', group: 'metalwork', aliases: ['حداد', 'حدّاد', 'حدادة', 'أبواب حديد'] },
  { slug: 'welder', label: 'لحّام', group: 'metalwork', aliases: ['لحام', 'لحّام', 'لحيم', 'لحام أرجون'] },
  { slug: 'aluminum_glass', label: 'فني ألمنيوم وزجاج', group: 'metalwork', aliases: ['ألمنيوم', 'المنيوم', 'زجاج', 'سكريت', 'شبابيك'] },
  { slug: 'shade_installer', label: 'فني مظلات وسواتر', group: 'metalwork', aliases: ['مظلات', 'سواتر', 'برجولات', 'هناجر'] },
  { slug: 'stainless_steel', label: 'فني ستانلس', group: 'metalwork', aliases: ['ستانلس', 'استانلس'] },
  // ── التشطيب والديكور ──────────────────────────────
  { slug: 'painter', label: 'دهّان', group: 'finishing', aliases: ['دهان', 'دهّان', 'نقاش', 'بويه', 'صباغ', 'دهانات'] },
  { slug: 'tiler', label: 'مبلّط', group: 'finishing', aliases: ['بلاط', 'مبلط', 'مبلّط', 'سيراميك', 'تبليط', 'بورسلان'] },
  { slug: 'marble_worker', label: 'فني رخام', group: 'finishing', aliases: ['رخام', 'جرانيت', 'تلميع رخام'] },
  { slug: 'plasterer', label: 'فني جبس', group: 'finishing', aliases: ['جبس', 'جبسم', 'جبسون', 'جبسم بورد', 'ديكور جبس'] },
  { slug: 'flooring', label: 'فني أرضيات', group: 'finishing', aliases: ['باركيه', 'أرضيات', 'ارضيات', 'فينيل', 'موكيت'] },
  { slug: 'wallpaper', label: 'فني ورق جدران', group: 'finishing', aliases: ['ورق جدران', 'ورق حائط'] },
  { slug: 'interior_designer', label: 'مصمم داخلي', group: 'finishing', aliases: ['مصمم داخلي', 'تصميم داخلي', 'ديكور داخلي'] },
  { slug: 'decorator', label: 'فني ديكور', group: 'finishing', aliases: ['ديكور', 'ديكورات'] },
  { slug: 'insulation', label: 'فني عزل', group: 'finishing', aliases: ['عزل', 'عزل أسطح', 'عزل مائي', 'عزل فوم'] },
  { slug: 'pool_technician', label: 'فني مسابح', group: 'finishing', aliases: ['مسابح', 'مسبح', 'صيانة مسبح'] },
  { slug: 'landscaper', label: 'منسّق حدائق', group: 'finishing', aliases: ['تنسيق حدائق', 'لاندسكيب', 'عشب صناعي', 'شلالات'] },
  // ── الصيانة والتركيب ──────────────────────────────
  { slug: 'handyman', label: 'فني صيانة عامة', group: 'maintenance', aliases: ['صيانة عامة', 'فني صيانة', 'صيانة منزلية'] },
  { slug: 'appliance_repair', label: 'فني صيانة أجهزة', group: 'maintenance', aliases: ['صيانة غسالة', 'غسالة', 'صيانة فرن', 'صيانة أجهزة', 'غسالة صحون', 'ثلاجة'] },
  { slug: 'tv_mount', label: 'فني تركيب شاشات', group: 'maintenance', aliases: ['تركيب شاشة', 'تعليق شاشة', 'تركيب تلفزيون'] },
  { slug: 'gardener', label: 'بستاني', group: 'maintenance', aliases: ['بستاني', 'قص عشب', 'تشجير', 'زراعة'] },
  { slug: 'printer_technician', label: 'فني طابعات', group: 'maintenance', aliases: ['طابعة', 'طابعات', 'صيانة طابعة'] },
  // ── النظافة والمكافحة ────────────────────────────
  { slug: 'cleaner', label: 'عامل نظافة', group: 'cleaning', aliases: ['تنظيف', 'نظافة', 'عاملة تنظيف', 'تنظيف منازل', 'جلي'] },
  { slug: 'sofa_cleaning', label: 'فني تنظيف كنب وسجاد', group: 'cleaning', aliases: ['تنظيف كنب', 'غسيل كنب', 'تنظيف سجاد', 'غسيل سجاد'] },
  { slug: 'ac_cleaning', label: 'فني تنظيف مكيفات', group: 'cleaning', aliases: ['تنظيف مكيف', 'غسيل مكيفات'] },
  { slug: 'pest_control', label: 'فني مكافحة حشرات', group: 'cleaning', aliases: ['مكافحة حشرات', 'رش مبيد', 'حشرات', 'نمل أبيض', 'رش مبيدات', 'صراصير'] },
  { slug: 'mover', label: 'فني نقل عفش', group: 'cleaning', aliases: ['نقل عفش', 'نقل أثاث', 'دينا نقل'] },
  { slug: 'waste_removal', label: 'فني نقل مخلفات', group: 'cleaning', aliases: ['نقل مخلفات', 'ترحيل أنقاض', 'مخلفات بناء'] },
  // ── السيارات والنقل ────────────────────────────────
  { slug: 'car_mechanic', label: 'ميكانيكي متنقل', group: 'vehicles', aliases: ['ميكانيكي متنقل', 'ميكانيكا', 'صيانة سيارة متنقلة'] },
  { slug: 'auto_electrician', label: 'كهربائي سيارات', group: 'vehicles', aliases: ['كهربائي سيارات', 'كهرباء سيارات'] },
  { slug: 'car_body', label: 'سمكري', group: 'vehicles', aliases: ['سمكري', 'سمكرة', 'سمكري سيارات'] },
  { slug: 'car_painter', label: 'دهّان سيارات', group: 'vehicles', aliases: ['دهان سيارات', 'صبغ سيارة'] },
  { slug: 'car_ac', label: 'فني مكيف سيارات', group: 'vehicles', aliases: ['مكيف سيارة', 'تكييف سيارات'] },
  { slug: 'tow_truck', label: 'سائق سطحة', group: 'vehicles', aliases: ['سطحة', 'ونش سيارات', 'سحب سيارة'] },
  { slug: 'mobile_car_wash', label: 'فني غسيل سيارات متنقل', group: 'vehicles', aliases: ['غسيل سيارات متنقل', 'تلميع سيارة', 'بوليش'] },
  { slug: 'tire_service', label: 'فني إطارات', group: 'vehicles', aliases: ['إطارات', 'كفرات', 'تبديل إطار'] },
  { slug: 'heavy_equipment', label: 'فني معدات ثقيلة', group: 'vehicles', aliases: ['معدات ثقيلة', 'صيانة شيول'] },
  { slug: 'motorcycle_mechanic', label: 'ميكانيكي دراجات', group: 'vehicles', aliases: ['دراجة نارية', 'موتر سايكل', 'صيانة دباب'] },
  { slug: 'driver', label: 'سائق', group: 'vehicles', aliases: ['سائق', 'سواق', 'توصيل مشاوير', 'سائق خاص'] },
  // ── التقنية والإلكترونيات ────────────────────
  { slug: 'it_support', label: 'فني كمبيوتر', group: 'tech', aliases: ['كمبيوتر', 'لابتوب', 'فني حاسب', 'صيانة كمبيوتر'] },
  { slug: 'phone_repair', label: 'فني صيانة جوالات', group: 'tech', aliases: ['صيانة جوال', 'تصليح جوال', 'شاشة جوال'] },
  { slug: 'network_engineer', label: 'فني شبكات', group: 'tech', aliases: ['شبكات', 'تمديد شبكة', 'راوتر'] },
  { slug: 'web_developer', label: 'مبرمج', group: 'tech', aliases: ['مبرمج', 'برمجة', 'تصميم موقع', 'تطبيق جوال'] },
  { slug: 'graphic_designer', label: 'مصمم جرافيك', group: 'tech', aliases: ['مصمم جرافيك', 'تصميم شعار', 'جرافيك'] },
  { slug: 'video_editor', label: 'محرر فيديو', group: 'tech', aliases: ['مونتاج', 'محرر فيديو', 'تعديل فيديو'] },
  { slug: 'social_media', label: 'مسوّق إلكتروني', group: 'tech', aliases: ['تسويق إلكتروني', 'إدارة حسابات', 'سوشيال ميديا'] },
  // ── خدمات شخصية ────────────────────────────────────────
  { slug: 'tailor', label: 'خيّاط', group: 'personal', aliases: ['خياط', 'خيّاط', 'خياطة', 'تفصيل ملابس'] },
  { slug: 'photographer', label: 'مصوّر', group: 'personal', aliases: ['مصور', 'مصوّر', 'تصوير', 'فوتوغرافي'] },
  { slug: 'home_barber', label: 'حلاق منزلي', group: 'personal', aliases: ['حلاق منزلي', 'حلاقة منزلية'] },
  { slug: 'home_beautician', label: 'خبيرة تجميل منزلي', group: 'personal', aliases: ['تجميل منزلي', 'مكياج عرايس', 'خبيرة تجميل'] },
  { slug: 'henna_artist', label: 'نقّاشة حناء', group: 'personal', aliases: ['حناء', 'نقش حناء'] },
  { slug: 'personal_trainer', label: 'مدرّب رياضي', group: 'personal', aliases: ['مدرب رياضي', 'مدرب شخصي', 'كوتش رياضي'] },
  { slug: 'massage_therapist', label: 'أخصائي مساج', group: 'personal', aliases: ['مساج', 'تدليك'] },
  { slug: 'physiotherapist', label: 'أخصائي علاج طبيعي', group: 'personal', aliases: ['علاج طبيعي', 'فيزيوثيرابي'] },
  // ── التعليم والرعاية ──────────────────────────────
  { slug: 'tutor', label: 'مدرّس خصوصي', group: 'care', aliases: ['مدرس', 'مدرّس', 'معلم خصوصي', 'دروس خصوصية', 'تأسيس'] },
  { slug: 'quran_teacher', label: 'محفّظ قرآن', group: 'care', aliases: ['تحفيظ قرآن', 'محفظ قرآن', 'تجويد'] },
  { slug: 'home_nurse', label: 'ممرّض منزلي', group: 'care', aliases: ['ممرض', 'ممرضة', 'تمريض منزلي', 'تمريض'] },
  { slug: 'babysitter', label: 'جليسة أطفال', group: 'care', aliases: ['جليسة أطفال', 'حاضنة', 'مربية'] },
  { slug: 'elderly_care', label: 'مرافق كبار سن', group: 'care', aliases: ['رعاية كبار السن', 'مرافق مسن', 'جليس مسن'] },
  { slug: 'speech_therapist', label: 'أخصائي تخاطب', group: 'care', aliases: ['تخاطب', 'صعوبات تعلم', 'ذوي احتياجات'] },
  // ── الطعام والمناسبات ────────────────────────────
  { slug: 'chef', label: 'طبّاخ', group: 'food', aliases: ['طباخ', 'طبّاخ', 'طباخة', 'ذبايح', 'بوفيه'] },
  { slug: 'home_baker', label: 'معجناتية منزلية', group: 'food', aliases: ['كيك', 'تورتة', 'معجنات منزلية'] },
  { slug: 'barista', label: 'باريستا', group: 'food', aliases: ['باريستا', 'تحضير قهوة'] },
  { slug: 'butcher', label: 'ملحّم', group: 'food', aliases: ['ملحم', 'ذبح', 'تقطيع ذبيحة'] },
  { slug: 'event_planner', label: 'منظّم مناسبات', group: 'food', aliases: ['تنظيم مناسبات', 'منظم حفلات', 'كوش'] },
  { slug: 'sound_lighting', label: 'فني صوتيات وإضاءة', group: 'food', aliases: ['صوتيات', 'إضاءة حفلات', 'دي جي'] },
  { slug: 'tent_installer', label: 'فني خيام', group: 'food', aliases: ['خيام', 'بيوت شعر', 'تركيب خيمة'] },
  // ── خدمات مهنية ────────────────────────────────────────
  { slug: 'accountant', label: 'محاسب', group: 'professional', aliases: ['محاسب', 'محاسبة', 'مسك دفاتر', 'إقرار ضريبي'] },
  { slug: 'translator', label: 'مترجم', group: 'professional', aliases: ['مترجم', 'ترجمة', 'ترجمة معتمدة'] },
  { slug: 'calligrapher', label: 'خطّاط', group: 'professional', aliases: ['خطاط', 'خط عربي'] },
];

export const PROFESSION_SLUGS = PROFESSIONS.map((p) => p.slug);

const BY_SLUG = new Map(PROFESSIONS.map((p) => [p.slug, p]));

export function professionFor(slug: string): Profession | null {
  return BY_SLUG.get(slug) ?? null;
}

/** The Arabic name, or the slug itself for a profession retired from the
 * list — an old profile keeps working, it just shows an unpolished label
 * rather than blanking out. */
export function professionLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

export function isKnownProfession(slug: unknown): slug is string {
  return typeof slug === 'string' && BY_SLUG.has(slug);
}

/** The trades grouped for the picker, in the order declared above. */
export function professionsByGroup() {
  return PROFESSION_GROUPS.map((group) => ({
    slug: group.slug,
    label: group.label,
    professions: PROFESSIONS.filter((p) => p.group === group.slug).map(({ slug, label }) => ({ slug, label })),
  }));
}

/** One line per group, for the classifier prompt: the model reads Arabic
 * names and answers with slugs, so it needs both, and the grouping helps it
 * pick the right neighbour among 100+ similar trades. */
export function professionPromptLines(): string {
  return professionsByGroup()
    .map((g) => `${g.label}: ${g.professions.map((p) => `${p.label}=${p.slug}`).join('، ')}`)
    .join('\n');
}
