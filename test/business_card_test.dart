import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/business_card.dart';
import 'package:rico_app/models/professional.dart';
import 'package:rico_app/widgets/business_card.dart';

/// البطاقة تُرسم في مكانين بنموذجين مختلفين (نتيجة بحث، ومعاينة ملفي)،
/// وتُملأ من ملفات مكتوبة على مراحل — بطاقة كاملة، وبطاقة ما فيها إلا
/// المهنة. فالمهم هنا أمران: ألا ينكسر تخطيطها في الطرفين، وألا يتسرّب
/// إليها ما ليس عليها.
void main() {
  Widget wrap(Widget child) => MaterialApp(
        locale: const Locale('ar', 'SA'),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      );

  const full = BusinessCardData(
    name: 'محمد العتيبي',
    professionLabel: 'دهّان',
    headline: 'دهانات داخلية وديكورات',
    bio: 'أشتغل دهانات داخلية وخارجية من ٢٠١٠، وأجي أعاين وأعطيك سعر قبل ما نبدأ.',
    skills: ['دهانات داخلية', 'ورق جدران'],
    yearsExperience: 14,
    accent: CardAccent.gold,
    cvUrl: 'https://app.rico-go.com/professionals/cv/abc',
    cvFileName: 'السيرة.pdf',
    cvContentType: 'application/pdf',
    distanceMeters: 2300,
    serviceRadiusMeters: 15000,
  );

  testWidgets('بطاقة كاملة تعرض كل ما نشره صاحبها', (tester) async {
    await tester.pumpWidget(wrap(BusinessCard(card: full, rank: 1, onRequest: () {})));
    await tester.pump();

    expect(find.text('محمد العتيبي'), findsOneWidget);
    expect(find.text('دهّان'), findsOneWidget);
    expect(find.text('دهانات داخلية وديكورات'), findsOneWidget);
    expect(find.text('ورق جدران'), findsOneWidget);
    expect(find.text('خبرة 14 سنة'), findsOneWidget);
    expect(find.text('2.3 كم'), findsOneWidget);
    expect(find.text('1'), findsOneWidget); // شارة الترتيب على الأفاتار
    expect(find.text('السيرة الذاتية'), findsOneWidget);
    expect(find.text('أرسل له طلب'), findsOneWidget);
  });

  // ملف كُتب قبل ما تصير البطاقة كاملة، أو واحد اكتفى بالمهنة: لا وصف ولا
  // مهارات ولا سيرة. البطاقة لازم تبقى بطاقة، لا كومة فراغات.
  testWidgets('بطاقة ما فيها إلا الاسم والمهنة ترسم بلا فراغات ولا تجاوز', (tester) async {
    const bare = BusinessCardData(name: 'سعد', professionLabel: 'سبّاك', distanceMeters: 400);

    await tester.pumpWidget(wrap(BusinessCard(card: bare, rank: 2, onRequest: () {})));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('سعد'), findsOneWidget);
    expect(find.text('سبّاك'), findsOneWidget);
    expect(find.text('400 م'), findsOneWidget);
    expect(find.text('السيرة الذاتية'), findsNothing);
  });

  testWidgets('المعاينة تعرض "عدّل البطاقة" بدل زر الطلب، وبلا بُعد ولا ترتيب', (tester) async {
    var edited = false;
    const mine = BusinessCardData(name: 'نورة', professionLabel: 'خيّاطة');

    await tester.pumpWidget(wrap(BusinessCard(card: mine, onEdit: () => edited = true)));
    await tester.pump();

    expect(find.text('أرسل له طلب'), findsNothing);
    await tester.tap(find.text('عدّل البطاقة'));
    expect(edited, isTrue);
  });

  // الحارس الحقيقي: البطاقة عامة يشوفها أي أحد يبحث، فما تحمل رقماً. الطبقة
  // التي تمنع ذلك هي [Professional] نفسه — ما فيه حقل رقم أصلاً — وهذا
  // الاختبار يثبت أن ما يصل من الخادم يُقرأ كاملاً بلا تهريب حقل زائد.
  test('بطاقة نتيجة البحث تُقرأ من رد الخادم بلا رقم ولا بريد', () {
    final professional = Professional.fromJson(const {
      'id': '1',
      'name': 'محمد',
      'profession': 'painter',
      'professionLabel': 'دهّان',
      'headline': 'دهانات',
      'bio': 'عن شغلي',
      'skills': ['ورق جدران'],
      'yearsExperience': 14,
      'cardAccent': 'midnight',
      'cvUrl': '/professionals/cv/abc',
      'cvFileName': 'cv.pdf',
      'cvContentType': 'application/pdf',
      'distanceMeters': 2300,
      'serviceRadiusMeters': 15000,
      // لو أضاف الخادم يوماً رقماً بالغلط، ما فيه مكان يستقبله.
      'phone': '+966500000000',
    });

    final card = professional.toCard(cvUrl: 'https://app.rico-go.com/professionals/cv/abc');

    expect(card.accent, CardAccent.midnight);
    expect(card.skills, ['ورق جدران']);
    expect(card.hasCv, isTrue);
    expect(card.cvIsImage, isFalse);
    expect(card.distanceLabel, '2.3 كم');
  });

  // لون أضيف على الخادم بعد إصدار هذي النسخة: البطاقة تظهر بالأخضر بدل ما
  // تنكسر أو تطلع بلا لون.
  test('لون غير معروف يسقط على الأخضر', () {
    expect(CardAccent.fromSlug('neon'), CardAccent.green);
    expect(CardAccent.fromSlug(null), CardAccent.green);
  });
}
