import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/services/intent_service.dart';

/// يحاكي القرار الفعلي في chat_screen عند فشل مصنّف الـLLM: إشارة بحث؟ ولا
/// دردشة؟ ولا تخمين افتراضي؟
String route(String text, {String? last}) {
  if (IntentService.hasSearchSignal(text, lastCategorySlug: last)) return 'search';
  return IntentService.detectOffTopicReply(text) != null ? 'chat' : 'fallback';
}

void main() {
  group('مطابقة الفئات على حدود الكلمة', () {
    // "كتب" داخل "اكتب"/"مكتب"، و"عرض" داخل "معرض"، و"مول" داخل "محمول" —
    // كانت كلها تطلّع فئة غلط قبل مطابقة حدود الكلمة.
    test('لا تطابق كلمة داخل كلمة أطول', () {
      expect(IntentService.parseMulti('بدي مكتب عقارات').first.slug, 'real_estate');
      expect(IntentService.parseMulti('أبي مكتب سفريات').first.slug, 'travel_agency');
      expect(IntentService.parseMulti('أبي مكتب محاماة').first.slug, 'lawyer');
      expect(IntentService.parseMulti('أبي معرض سيارات').first.slug, 'car_dealer');
      expect(IntentService.parseMulti('أبي محل محمول').first.slug, 'mobile_phone');
    });

    test('تطابق مع البادئات العربية (ال/بال/لل)', () {
      expect(IntentService.parseMulti('وين المطعم').first.slug, 'restaurant');
      expect(IntentService.parseMulti('بالمول').first.slug, 'mall');
      expect(IntentService.parseMulti('للصيدلية').first.slug, 'pharmacy');
    });

    test('أطول كلمة مطابقة تفوز، مش أول فئة بالقائمة', () {
      // "مغسلة ملابس" أخص من "ملابس" لحالها
      expect(IntentService.parseMulti('أبي مغسلة ملابس').first.slug, 'laundry');
      expect(IntentService.parseMulti('أبي محل ملابس').first.slug, 'clothes');
      // "عيادة اسنان" أخص من "عيادة"
      expect(IntentService.parseMulti('أقرب عيادة اسنان').first.slug, 'dentist');
      expect(IntentService.parseMulti('أقرب عيادة').first.slug, 'clinic');
    });

    test('نية العروض منفصلة عن فئات الأماكن', () {
      final intents = IntentService.parseMulti('وش العروض القريبة؟');
      expect(intents.first.kind, IntentKind.deals);
    });
  });

  group('ردود الدردشة عند فشل التصنيف الذكي', () {
    test('التحية ما تصير بحث مطاعم', () {
      // هذا كان الخلل الأصلي: "هلا" ترجع نتائج مطاعم.
      for (final greeting in ['هلا', 'مرحبا', 'كيفك', 'شلونك', 'صباح الخير', 'وعليكم السلام']) {
        expect(route(greeting), 'chat', reason: greeting);
      }
    });

    test('أنواع الأسئلة الثانية لها ردود', () {
      const asks = {
        'شكراً': 'شكر',
        'مع السلامة': 'وداع',
        'مين انت': 'تعريف',
        'ساعدني': 'مساعدة',
        'فيه توصيل؟': 'توصيل',
        'وش رقمهم': 'تواصل',
        'كيف أوصل': 'اتجاهات',
        'كم السعر': 'أسعار',
        'متى يفتح': 'دوام',
        'بياناتي': 'خصوصية',
        'كم الساعة': 'برا الخدمة',
        'عندي محل': 'صاحب نشاط',
      };
      asks.forEach((ask, kind) {
        expect(route(ask), 'chat', reason: '$ask ($kind)');
      });
    });

    test('طلب حقيقي مع تحية بنفس الرسالة يظل بحث', () {
      expect(route('هلا، وين أقرب مطعم؟'), 'search');
      expect(route('شكرا بس أبي أرخص كافيه'), 'search');
    });

    test('كل رد ينتهي بدعوة لاستخدام ريكو', () {
      for (final ask in ['هلا', 'بياناتي', 'كم الساعة', 'فيه توصيل؟', 'مع السلامة']) {
        final reply = IntentService.detectOffTopicReply(ask)!;
        final lastLine = reply.trim().split('\n').last;
        expect(
          lastLine.contains('؟') ||
              lastLine.contains('قل لي') ||
              lastLine.contains('جرّب') ||
              lastLine.contains('اطلب') ||
              lastLine.contains('أمرك'),
          isTrue,
          reason: 'رد "$ask" خلص بلا دعوة: $lastLine',
        );
      }
    });

    test('الاستكمال يستخدم آخر فئة بدل التخمين', () {
      expect(route('أبعد شوي', last: 'cafe'), 'search');
      expect(IntentService.parseMulti('أبعد شوي', lastCategorySlug: 'cafe').first.slug, 'cafe');
    });
  });

  group('طلب صاحب مهنة (المسار المحلي الاحتياطي)', () {
    test('اسم مهنة يطلّع نية شخص لا نية مكان', () {
      final intent = IntentService.parseMulti('أبغى دهان').first;
      expect(intent.kind, IntentKind.professional);
      expect(intent.profession, 'painter');
    });

    test('يتعرّف على صيغ عامية مختلفة لنفس المهنة', () {
      expect(IntentService.parseMulti('أحتاج كهربجي').first.profession, 'electrician');
      expect(IntentService.parseMulti('أبي سباك').first.profession, 'plumber');
      expect(IntentService.parseMulti('مين يصلّح المكيف؟').first.profession, 'ac_technician');
    });

    test('كلمة تدل على محل تغلّب المكان على الشخص', () {
      // "دهانات" اسم مهنة وبضاعة معاً — وجود "محل" يحسمها لصالح المكان.
      expect(IntentService.parseMulti('وين محل دهانات؟').first.kind, IntentKind.place);
      expect(IntentService.parseMulti('أقرب ورشة تصليح سيارة').first.kind, IntentKind.place);
      expect(IntentService.professionFor('محل دهانات'), isNull);
    });

    test('أطول صيغة مطابقة تفوز', () {
      // "تنظيف خزانات" أخص من "تنظيف" لحالها.
      expect(IntentService.parseMulti('أبي تنظيف خزانات').first.profession, 'water_tank_cleaning');
      expect(IntentService.parseMulti('أبي تنظيف').first.profession, 'cleaner');
    });

    test('المهنة إشارة بحث، فلا تُعامل كدردشة', () {
      expect(route('أبغى نجار'), 'search');
      expect(route('هلا، أحتاج دهان'), 'search');
    });

    test('المطابقة على حدود الكلمة من الطرفين', () {
      // بلا تثبيت نهاية الكلمة كانت "مدرس" تطابق داخل "مدرسة"، فيصير السؤال
      // عن أقرب مدرسة طلب مدرّس خصوصي.
      expect(IntentService.professionFor('أقرب مدرسة'), isNull);
      expect(IntentService.professionFor('رشّح لي مطعم'), isNull);
      // ولواحق الجمع الشائعة تظل تطابق.
      expect(IntentService.professionFor('أبي دهانين')?.slug, 'painter');
    });

    test('byProfessionSlug يمرّر سلوقاً غير معروف بدل إسقاطه', () {
      // مهنة أُضيفت على الخادم بعد إصدار هذي النسخة: الخادم يعرف يبحث عنها،
      // والناقص عندنا الاسم العربي فقط.
      final intent = IntentService.byProfessionSlug('locksmith');
      expect(intent.kind, IntentKind.professional);
      expect(intent.profession, 'locksmith');
      expect(intent.label, 'locksmith');
    });
  });

  group('طلب عمالة عام بلا تخصص', () {
    // سيناريو حقيقي: صاحب ورشة يدوّر فنيين. كلمة "فنيين" وحدها تشمل مئة
    // مهنة، فالجواب الصحيح سؤال عن التخصص لا قائمة مخمّنة.
    test('يسأل عن التخصص بدل ما يخمّن مهنة', () {
      expect(route('اليوم فتحت ورشة وبدور على فنيين'), 'chat');
      expect(route('أبي عمال'), 'chat');
      expect(route('أدور صنايعية'), 'chat');

      final reply = IntentService.detectOffTopicReply('اليوم فتحت ورشة وبدور على فنيين')!;
      expect(reply.contains('التخصص') || reply.contains('المهنة'), isTrue);
    });

    test('لكن طلب فيه تخصص فعلي يروح للبحث', () {
      expect(route('أبي فني تكييف'), 'search');
      expect(IntentService.parseMulti('أبي فني تكييف').first.profession, 'ac_technician');
      expect(route('أبي فني صيانة'), 'search');
    });
  });

  group('اتساع جدول المهن', () {
    test('يتعرّف على مهن من مجموعات مختلفة', () {
      final cases = {
        'أبي مقاول': 'contractor',
        'أحتاج مبلّط': 'tiler',
        'مين يركب لي مطابخ؟': 'kitchen_installer',
        'أدور سطحة': 'tow_truck',
        'أبغى فني مصاعد': 'elevator_technician',
        'أحتاج تسليك': 'drain_cleaning',
        'أبي منجد': 'upholsterer',
        'مين يسوي عزل أسطح؟': 'insulation',
        'أبغى فني كاميرات مراقبة': 'cctv',
        'أدور مترجم': 'translator',
        'أبي جليسة أطفال': 'babysitter',
        'أحتاج فني طاقة شمسية': 'solar_technician',
      };
      cases.forEach((text, slug) {
        expect(IntentService.parseMulti(text).first.profession, slug, reason: text);
      });
    });

    test('الصيغة الأطول تفوز عبر الجدولين، فالمحل يبقى محلاً', () {
      // "تنظيف" مهنة و"تنظيف جاف" مغسلة؛ "كهربائي" مهنة و"كهربائيات" محل.
      expect(IntentService.parseMulti('وين أقرب تنظيف جاف؟').first.kind, IntentKind.place);
      expect(IntentService.parseMulti('أبي محل كهربائيات').first.kind, IntentKind.place);
      expect(IntentService.parseMulti('أبي تنظيف').first.profession, 'cleaner');
      expect(IntentService.parseMulti('أبي كهربائي').first.profession, 'electrician');
    });

    test('كلمة محل داخل كلمة أطول ما تعطّل المطابقة', () {
      // "مركز" كانت تطابق داخل "مركزي" فتُسقط "تكييف مركزي" كلها.
      expect(IntentService.parseMulti('أبي فني تكييف مركزي').first.profession, 'central_ac');
    });
  });
}
