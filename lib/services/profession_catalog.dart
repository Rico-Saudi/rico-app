import '../models/profession.dart';

/// قائمة المهن المعروفة — النسخة المحلية من قائمة الخادم
/// (server/rico-backend/src/professionals/constants/professions.ts).
///
/// الخادم يعرضها كذلك على `GET /professionals/professions` (انظر
/// [ProfessionalsService.fetchProfessions])، ومنتقي المهنة في ورقة الحساب
/// يفضّل القائمة القادمة من الخادم عشان مهنة تُضاف بعد إصدار التطبيق توصل
/// للأجهزة بلا تحديث. وهذي النسخة هي الاحتياط حين تفشل الشبكة، وهي كذلك
/// **المصدر الوحيد** للمطابقة المحلية بالكلمات المفتاحية في
/// [IntentService] — تلك تحتاج الصيغ العامية ([Profession.aliases]) التي
/// لا يرسلها الخادم أصلاً.
///
/// قاعدة على أي صيغة تُضاف هنا: ما تكون كلمة تعني **مكاناً** أصلاً (انظر
/// `IntentService._categories`). "عفش" محل أثاث و"ميكانيكي" كراج، فادّعاؤها
/// هنا يخلي المسار الاحتياطي يرد على سؤال عن محل بقائمة أشخاص. الصيغة
/// المقيّدة هي الحل — "حلاق منزلي" لا "حلاق". يحرس هذا اختبار
/// "لا تتصادم أسماء المهن مع كلمات فئات الأماكن".
class ProfessionCatalog {
  const ProfessionCatalog._();

  /// أقسام المنتقي بترتيب عرضها.
  static const List<ProfessionGroup> groups = [
    ProfessionGroup(slug: 'construction', label: 'البناء والمقاولات'),
    ProfessionGroup(slug: 'electrical', label: 'الكهرباء والتكييف'),
    ProfessionGroup(slug: 'plumbing', label: 'السباكة والمياه'),
    ProfessionGroup(slug: 'carpentry', label: 'النجارة والأثاث'),
    ProfessionGroup(slug: 'metalwork', label: 'الحدادة والألمنيوم'),
    ProfessionGroup(slug: 'finishing', label: 'التشطيب والديكور'),
    ProfessionGroup(slug: 'maintenance', label: 'الصيانة والتركيب'),
    ProfessionGroup(slug: 'cleaning', label: 'النظافة والمكافحة'),
    ProfessionGroup(slug: 'vehicles', label: 'السيارات والنقل'),
    ProfessionGroup(slug: 'tech', label: 'التقنية والإلكترونيات'),
    ProfessionGroup(slug: 'personal', label: 'خدمات شخصية'),
    ProfessionGroup(slug: 'care', label: 'التعليم والرعاية'),
    ProfessionGroup(slug: 'food', label: 'الطعام والمناسبات'),
    ProfessionGroup(slug: 'professional', label: 'خدمات مهنية'),
  ];

  static const List<Profession> all = [
    // ── البناء والمقاولات ────────────────────────
    Profession(slug: 'mason', label: 'بنّاء', group: 'construction', aliases: ['بنّاء', 'معلم بناء', 'بلوك', 'طابوق', 'بناء جدار']),
    Profession(slug: 'contractor', label: 'مقاول', group: 'construction', aliases: ['مقاول', 'مقاولات', 'مقاول بناء', 'مقاول تشطيب']),
    Profession(slug: 'concrete_worker', label: 'فني صبّ خرسانة', group: 'construction', aliases: ['صب خرسانة', 'خرسانة', 'صبة', 'مضخة خرسانة']),
    Profession(slug: 'steel_fixer', label: 'حدّاد مسلّح', group: 'construction', aliases: ['حداد مسلح', 'تسليح', 'حديد تسليح']),
    Profession(slug: 'surveyor', label: 'مسّاح', group: 'construction', aliases: ['مساح', 'مساحة أراضي', 'رفع مساحي']),
    Profession(slug: 'civil_engineer', label: 'مهندس مدني', group: 'construction', aliases: ['مهندس مدني', 'هندسة مدنية', 'إشراف هندسي']),
    Profession(slug: 'architect', label: 'مهندس معماري', group: 'construction', aliases: ['مهندس معماري', 'معماري', 'تصميم معماري', 'مخططات']),
    Profession(slug: 'demolition', label: 'فني هدم وتكسير', group: 'construction', aliases: ['هدم', 'تكسير', 'هدم جدار']),
    Profession(slug: 'excavator_operator', label: 'سائق حفّار', group: 'construction', aliases: ['حفار', 'شيول', 'بوبكات', 'حفر أساسات']),
    Profession(slug: 'scaffolder', label: 'فني سقالات', group: 'construction', aliases: ['سقالات', 'شدة معدنية']),
    Profession(slug: 'roofer', label: 'فني أسطح', group: 'construction', aliases: ['ترميم سطح', 'أسطح', 'ترميم سقف']),
    Profession(slug: 'well_driller', label: 'فني حفر آبار', group: 'construction', aliases: ['حفر آبار', 'بئر', 'آبار']),
    // ── الكهرباء والتكييف ────────────────────────
    Profession(slug: 'electrician', label: 'كهربائي', group: 'electrical', aliases: ['كهربائي', 'كهربجي', 'فني كهرباء', 'تمديدات كهرباء', 'لوحة كهرباء']),
    Profession(slug: 'ac_technician', label: 'فني تكييف', group: 'electrical', aliases: ['تكييف', 'مكيف', 'مكيفات', 'فني مكيفات', 'سبليت', 'صيانة مكيفات']),
    Profession(slug: 'central_ac', label: 'فني تكييف مركزي', group: 'electrical', aliases: ['تكييف مركزي', 'دكت', 'مجاري هواء']),
    Profession(slug: 'refrigeration', label: 'فني تبريد', group: 'electrical', aliases: ['تبريد', 'غرف تبريد', 'فريزر', 'ثلاجة عرض']),
    Profession(slug: 'generator_technician', label: 'فني مولدات', group: 'electrical', aliases: ['مولدات', 'مولد كهرباء', 'جنريتر']),
    Profession(slug: 'solar_technician', label: 'فني طاقة شمسية', group: 'electrical', aliases: ['طاقة شمسية', 'ألواح شمسية', 'سخان شمسي']),
    Profession(slug: 'elevator_technician', label: 'فني مصاعد', group: 'electrical', aliases: ['مصاعد', 'مصعد', 'أسانسير']),
    Profession(slug: 'low_current', label: 'فني تيار خفيف', group: 'electrical', aliases: ['تيار خفيف', 'انتركم', 'إنتركم']),
    Profession(slug: 'cctv', label: 'فني كاميرات مراقبة', group: 'electrical', aliases: ['كاميرات', 'كاميرات مراقبة', 'مراقبة']),
    Profession(slug: 'alarm_systems', label: 'فني أنظمة إنذار', group: 'electrical', aliases: ['إنذار', 'انذار حريق', 'أنظمة إنذار']),
    Profession(slug: 'fire_safety', label: 'فني أنظمة إطفاء', group: 'electrical', aliases: ['إطفاء', 'طفايات', 'رشاشات حريق']),
    Profession(slug: 'smart_home', label: 'فني منازل ذكية', group: 'electrical', aliases: ['منزل ذكي', 'سمارت هوم', 'أتمتة منزل']),
    Profession(slug: 'satellite_technician', label: 'فني ستلايت', group: 'electrical', aliases: ['ستلايت', 'دش', 'رسيفر']),
    // ── السباكة والمياه ────────────────────────────
    Profession(slug: 'plumber', label: 'سبّاك', group: 'plumbing', aliases: ['سباك', 'سبّاك', 'فني صحي', 'مواسير', 'تمديدات صحية']),
    Profession(slug: 'drain_cleaning', label: 'فني تسليك مجاري', group: 'plumbing', aliases: ['تسليك', 'مجاري', 'بيارة', 'شفط بيارات']),
    Profession(slug: 'leak_detection', label: 'فني كشف تسربات', group: 'plumbing', aliases: ['كشف تسربات', 'تسرب مياه', 'تسريب مياه']),
    Profession(slug: 'water_tank_cleaning', label: 'فني تنظيف خزانات', group: 'plumbing', aliases: ['تنظيف خزان', 'خزانات', 'غسيل خزان', 'عزل خزانات']),
    Profession(slug: 'water_pump', label: 'فني مضخات مياه', group: 'plumbing', aliases: ['مضخة مياه', 'دينمو مياه', 'طرمبة']),
    Profession(slug: 'water_filter', label: 'فني فلاتر مياه', group: 'plumbing', aliases: ['فلتر مياه', 'فلاتر', 'محطة تحلية']),
    // ── النجارة والأثاث ────────────────────────────
    Profession(slug: 'carpenter', label: 'نجّار', group: 'carpentry', aliases: ['نجار', 'نجّار', 'نجارة', 'تفصيل خشب']),
    Profession(slug: 'furniture_assembly', label: 'فني تركيب أثاث', group: 'carpentry', aliases: ['تركيب أثاث', 'فك وتركيب', 'تركيب غرف نوم']),
    Profession(slug: 'kitchen_installer', label: 'فني تركيب مطابخ', group: 'carpentry', aliases: ['تركيب مطابخ', 'مطبخ', 'مطابخ']),
    Profession(slug: 'door_installer', label: 'فني تركيب أبواب', group: 'carpentry', aliases: ['تركيب أبواب', 'أبواب', 'تركيب باب']),
    Profession(slug: 'upholsterer', label: 'منجّد', group: 'carpentry', aliases: ['منجد', 'تنجيد', 'تنجيد كنب']),
    Profession(slug: 'curtain_installer', label: 'فني تركيب ستائر', group: 'carpentry', aliases: ['ستائر', 'تركيب ستارة', 'ستارة']),
    // ── الحدادة والألمنيوم ──────────────────────
    Profession(slug: 'blacksmith', label: 'حدّاد', group: 'metalwork', aliases: ['حداد', 'حدّاد', 'حدادة', 'أبواب حديد']),
    Profession(slug: 'welder', label: 'لحّام', group: 'metalwork', aliases: ['لحام', 'لحّام', 'لحيم', 'لحام أرجون']),
    Profession(slug: 'aluminum_glass', label: 'فني ألمنيوم وزجاج', group: 'metalwork', aliases: ['ألمنيوم', 'المنيوم', 'زجاج', 'سكريت', 'شبابيك']),
    Profession(slug: 'shade_installer', label: 'فني مظلات وسواتر', group: 'metalwork', aliases: ['مظلات', 'سواتر', 'برجولات', 'هناجر']),
    Profession(slug: 'stainless_steel', label: 'فني ستانلس', group: 'metalwork', aliases: ['ستانلس', 'استانلس']),
    // ── التشطيب والديكور ──────────────────────────
    Profession(slug: 'painter', label: 'دهّان', group: 'finishing', aliases: ['دهان', 'دهّان', 'نقاش', 'بويه', 'صباغ', 'دهانات']),
    Profession(slug: 'tiler', label: 'مبلّط', group: 'finishing', aliases: ['بلاط', 'مبلط', 'مبلّط', 'سيراميك', 'تبليط', 'بورسلان']),
    Profession(slug: 'marble_worker', label: 'فني رخام', group: 'finishing', aliases: ['رخام', 'جرانيت', 'تلميع رخام']),
    Profession(slug: 'plasterer', label: 'فني جبس', group: 'finishing', aliases: ['جبس', 'جبسم', 'جبسون', 'جبسم بورد', 'ديكور جبس']),
    Profession(slug: 'flooring', label: 'فني أرضيات', group: 'finishing', aliases: ['باركيه', 'أرضيات', 'ارضيات', 'فينيل', 'موكيت']),
    Profession(slug: 'wallpaper', label: 'فني ورق جدران', group: 'finishing', aliases: ['ورق جدران', 'ورق حائط']),
    Profession(slug: 'interior_designer', label: 'مصمم داخلي', group: 'finishing', aliases: ['مصمم داخلي', 'تصميم داخلي', 'ديكور داخلي']),
    Profession(slug: 'decorator', label: 'فني ديكور', group: 'finishing', aliases: ['ديكور', 'ديكورات']),
    Profession(slug: 'insulation', label: 'فني عزل', group: 'finishing', aliases: ['عزل', 'عزل أسطح', 'عزل مائي', 'عزل فوم']),
    Profession(slug: 'pool_technician', label: 'فني مسابح', group: 'finishing', aliases: ['مسابح', 'مسبح', 'صيانة مسبح']),
    Profession(slug: 'landscaper', label: 'منسّق حدائق', group: 'finishing', aliases: ['تنسيق حدائق', 'لاندسكيب', 'عشب صناعي', 'شلالات']),
    // ── الصيانة والتركيب ──────────────────────────
    Profession(slug: 'handyman', label: 'فني صيانة عامة', group: 'maintenance', aliases: ['صيانة عامة', 'فني صيانة', 'صيانة منزلية']),
    Profession(slug: 'appliance_repair', label: 'فني صيانة أجهزة', group: 'maintenance', aliases: ['صيانة غسالة', 'غسالة', 'صيانة فرن', 'صيانة أجهزة', 'غسالة صحون', 'ثلاجة']),
    Profession(slug: 'tv_mount', label: 'فني تركيب شاشات', group: 'maintenance', aliases: ['تركيب شاشة', 'تعليق شاشة', 'تركيب تلفزيون']),
    Profession(slug: 'gardener', label: 'بستاني', group: 'maintenance', aliases: ['بستاني', 'قص عشب', 'تشجير', 'زراعة']),
    Profession(slug: 'printer_technician', label: 'فني طابعات', group: 'maintenance', aliases: ['طابعة', 'طابعات', 'صيانة طابعة']),
    // ── النظافة والمكافحة ────────────────────────
    Profession(slug: 'cleaner', label: 'عامل نظافة', group: 'cleaning', aliases: ['تنظيف', 'نظافة', 'عاملة تنظيف', 'تنظيف منازل', 'جلي']),
    Profession(slug: 'sofa_cleaning', label: 'فني تنظيف كنب وسجاد', group: 'cleaning', aliases: ['تنظيف كنب', 'غسيل كنب', 'تنظيف سجاد', 'غسيل سجاد']),
    Profession(slug: 'ac_cleaning', label: 'فني تنظيف مكيفات', group: 'cleaning', aliases: ['تنظيف مكيف', 'غسيل مكيفات']),
    Profession(slug: 'pest_control', label: 'فني مكافحة حشرات', group: 'cleaning', aliases: ['مكافحة حشرات', 'رش مبيد', 'حشرات', 'نمل أبيض', 'رش مبيدات', 'صراصير']),
    Profession(slug: 'mover', label: 'فني نقل عفش', group: 'cleaning', aliases: ['نقل عفش', 'نقل أثاث', 'دينا نقل']),
    Profession(slug: 'waste_removal', label: 'فني نقل مخلفات', group: 'cleaning', aliases: ['نقل مخلفات', 'ترحيل أنقاض', 'مخلفات بناء']),
    // ── السيارات والنقل ────────────────────────────
    Profession(slug: 'car_mechanic', label: 'ميكانيكي متنقل', group: 'vehicles', aliases: ['ميكانيكي متنقل', 'ميكانيكا', 'صيانة سيارة متنقلة']),
    Profession(slug: 'auto_electrician', label: 'كهربائي سيارات', group: 'vehicles', aliases: ['كهربائي سيارات', 'كهرباء سيارات']),
    Profession(slug: 'car_body', label: 'سمكري', group: 'vehicles', aliases: ['سمكري', 'سمكرة', 'سمكري سيارات']),
    Profession(slug: 'car_painter', label: 'دهّان سيارات', group: 'vehicles', aliases: ['دهان سيارات', 'صبغ سيارة']),
    Profession(slug: 'car_ac', label: 'فني مكيف سيارات', group: 'vehicles', aliases: ['مكيف سيارة', 'تكييف سيارات']),
    Profession(slug: 'tow_truck', label: 'سائق سطحة', group: 'vehicles', aliases: ['سطحة', 'ونش سيارات', 'سحب سيارة']),
    Profession(slug: 'mobile_car_wash', label: 'فني غسيل سيارات متنقل', group: 'vehicles', aliases: ['غسيل سيارات متنقل', 'تلميع سيارة', 'بوليش']),
    Profession(slug: 'tire_service', label: 'فني إطارات', group: 'vehicles', aliases: ['إطارات', 'كفرات', 'تبديل إطار']),
    Profession(slug: 'heavy_equipment', label: 'فني معدات ثقيلة', group: 'vehicles', aliases: ['معدات ثقيلة', 'صيانة شيول']),
    Profession(slug: 'motorcycle_mechanic', label: 'ميكانيكي دراجات', group: 'vehicles', aliases: ['دراجة نارية', 'موتر سايكل', 'صيانة دباب']),
    Profession(slug: 'driver', label: 'سائق', group: 'vehicles', aliases: ['سائق', 'سواق', 'توصيل مشاوير', 'سائق خاص']),
    // ── التقنية والإلكترونيات ────────────────
    Profession(slug: 'it_support', label: 'فني كمبيوتر', group: 'tech', aliases: ['كمبيوتر', 'لابتوب', 'فني حاسب', 'صيانة كمبيوتر']),
    Profession(slug: 'phone_repair', label: 'فني صيانة جوالات', group: 'tech', aliases: ['صيانة جوال', 'تصليح جوال', 'شاشة جوال']),
    Profession(slug: 'network_engineer', label: 'فني شبكات', group: 'tech', aliases: ['شبكات', 'تمديد شبكة', 'راوتر']),
    Profession(slug: 'web_developer', label: 'مبرمج', group: 'tech', aliases: ['مبرمج', 'برمجة', 'تصميم موقع', 'تطبيق جوال']),
    Profession(slug: 'graphic_designer', label: 'مصمم جرافيك', group: 'tech', aliases: ['مصمم جرافيك', 'تصميم شعار', 'جرافيك']),
    Profession(slug: 'video_editor', label: 'محرر فيديو', group: 'tech', aliases: ['مونتاج', 'محرر فيديو', 'تعديل فيديو']),
    Profession(slug: 'social_media', label: 'مسوّق إلكتروني', group: 'tech', aliases: ['تسويق إلكتروني', 'إدارة حسابات', 'سوشيال ميديا']),
    // ── خدمات شخصية ────────────────────────────────────
    Profession(slug: 'tailor', label: 'خيّاط', group: 'personal', aliases: ['خياط', 'خيّاط', 'خياطة', 'تفصيل ملابس']),
    Profession(slug: 'photographer', label: 'مصوّر', group: 'personal', aliases: ['مصور', 'مصوّر', 'تصوير', 'فوتوغرافي']),
    Profession(slug: 'home_barber', label: 'حلاق منزلي', group: 'personal', aliases: ['حلاق منزلي', 'حلاقة منزلية']),
    Profession(slug: 'home_beautician', label: 'خبيرة تجميل منزلي', group: 'personal', aliases: ['تجميل منزلي', 'مكياج عرايس', 'خبيرة تجميل']),
    Profession(slug: 'henna_artist', label: 'نقّاشة حناء', group: 'personal', aliases: ['حناء', 'نقش حناء']),
    Profession(slug: 'personal_trainer', label: 'مدرّب رياضي', group: 'personal', aliases: ['مدرب رياضي', 'مدرب شخصي', 'كوتش رياضي']),
    Profession(slug: 'massage_therapist', label: 'أخصائي مساج', group: 'personal', aliases: ['مساج', 'تدليك']),
    Profession(slug: 'physiotherapist', label: 'أخصائي علاج طبيعي', group: 'personal', aliases: ['علاج طبيعي', 'فيزيوثيرابي']),
    // ── التعليم والرعاية ──────────────────────────
    Profession(slug: 'tutor', label: 'مدرّس خصوصي', group: 'care', aliases: ['مدرس', 'مدرّس', 'معلم خصوصي', 'دروس خصوصية', 'تأسيس']),
    Profession(slug: 'quran_teacher', label: 'محفّظ قرآن', group: 'care', aliases: ['تحفيظ قرآن', 'محفظ قرآن', 'تجويد']),
    Profession(slug: 'home_nurse', label: 'ممرّض منزلي', group: 'care', aliases: ['ممرض', 'ممرضة', 'تمريض منزلي', 'تمريض']),
    Profession(slug: 'babysitter', label: 'جليسة أطفال', group: 'care', aliases: ['جليسة أطفال', 'حاضنة', 'مربية']),
    Profession(slug: 'elderly_care', label: 'مرافق كبار سن', group: 'care', aliases: ['رعاية كبار السن', 'مرافق مسن', 'جليس مسن']),
    Profession(slug: 'speech_therapist', label: 'أخصائي تخاطب', group: 'care', aliases: ['تخاطب', 'صعوبات تعلم', 'ذوي احتياجات']),
    // ── الطعام والمناسبات ────────────────────────
    Profession(slug: 'chef', label: 'طبّاخ', group: 'food', aliases: ['طباخ', 'طبّاخ', 'طباخة', 'ذبايح', 'بوفيه']),
    Profession(slug: 'home_baker', label: 'معجناتية منزلية', group: 'food', aliases: ['كيك', 'تورتة', 'معجنات منزلية']),
    Profession(slug: 'barista', label: 'باريستا', group: 'food', aliases: ['باريستا', 'تحضير قهوة']),
    Profession(slug: 'butcher', label: 'ملحّم', group: 'food', aliases: ['ملحم', 'ذبح', 'تقطيع ذبيحة']),
    Profession(slug: 'event_planner', label: 'منظّم مناسبات', group: 'food', aliases: ['تنظيم مناسبات', 'منظم حفلات', 'كوش']),
    Profession(slug: 'sound_lighting', label: 'فني صوتيات وإضاءة', group: 'food', aliases: ['صوتيات', 'إضاءة حفلات', 'دي جي']),
    Profession(slug: 'tent_installer', label: 'فني خيام', group: 'food', aliases: ['خيام', 'بيوت شعر', 'تركيب خيمة']),
    // ── خدمات مهنية ────────────────────────────────────
    Profession(slug: 'accountant', label: 'محاسب', group: 'professional', aliases: ['محاسب', 'محاسبة', 'مسك دفاتر', 'إقرار ضريبي']),
    Profession(slug: 'translator', label: 'مترجم', group: 'professional', aliases: ['مترجم', 'ترجمة', 'ترجمة معتمدة']),
    Profession(slug: 'calligrapher', label: 'خطّاط', group: 'professional', aliases: ['خطاط', 'خط عربي']),
  ];

  static final Map<String, Profession> _bySlug = {for (final p in all) p.slug: p};

  static Profession? bySlug(String slug) => _bySlug[slug];

  /// الاسم العربي، أو السلوق نفسه لمهنة أُضيفت على الخادم بعد إصدار هذي
  /// النسخة — تبقى مفهومة ولو بلا اسم مصقول، بدل ما يظهر فراغ.
  static String labelFor(String slug) => _bySlug[slug]?.label ?? slug;
}
