import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/weather_info.dart';
import 'package:rico_app/services/intent_service.dart';
import 'package:rico_app/widgets/welcome_hero.dart';

/// بطاقة الجو اختيارية تماماً: تظهر حين يكون للجو رأي، وتختفي بلا أثر حين لا
/// يكون — وأهم ما يُختبر فيها هو حالات الاختفاء، لأن ظهور بطاقة فاضية أو
/// انهيار الشاشة بسبب غياب قراءة أسوأ بكثير من غياب اقتراح.
void main() {
  WeatherInfo weather({
    required String bucket,
    int tempC = 40,
    WeatherSuggestion? suggestion,
  }) =>
      WeatherInfo(
        tempC: tempC,
        condition: 'clear',
        bucket: bucket,
        notable: true,
        descriptionAr: 'الجو حار، $tempC°',
        suggestion: suggestion,
      );

  final hotSuggestion = WeatherSuggestion(
    line: 'الجو حار الحين 🥵 تبي شي بارد؟',
    chips: [
      WeatherChip(label: 'قهوة مثلجة', prompt: 'أقرب كافيه فيه قهوة مثلجة'),
      WeatherChip(label: 'عصير طازج', prompt: 'أقرب محل عصير طازج'),
    ],
  );

  Widget wrap(Widget child) => MaterialApp(
        locale: const Locale('ar', 'SA'),
        home: Directionality(textDirection: TextDirection.rtl, child: Scaffold(body: child)),
      );

  testWidgets('شاشة الترحيب تشتغل عادي بلا أي قراءة جو', (tester) async {
    await tester.pumpWidget(wrap(WelcomeHero(onPickSuggestion: (_) {})));
    await tester.pump();

    expect(find.text('جرّب تسألني'), findsOneWidget);
    expect(find.text('أقرب مطعم'), findsOneWidget);
  });

  testWidgets('جو بلا اقتراح لا يعرض بطاقة فاضية', (tester) async {
    // الجو المعتدل ما يقترح شي — الخادم يرجع suggestion=null، والمفروض
    // الشاشة تبقى كما هي بالضبط بدل بطاقة بلا محتوى.
    await tester.pumpWidget(
      wrap(WelcomeHero(onPickSuggestion: (_) {}, weather: weather(bucket: 'mild', tempC: 33))),
    );
    await tester.pump();

    expect(find.text('جرّب تسألني'), findsOneWidget);
    expect(find.textContaining('تبي شي بارد'), findsNothing);
  });

  testWidgets('الجو الحار يعرض سطره وحبّاته ودرجته', (tester) async {
    await tester.pumpWidget(
      wrap(WelcomeHero(onPickSuggestion: (_) {}, weather: weather(bucket: 'hot', suggestion: hotSuggestion))),
    );
    await tester.pump();

    expect(find.text('الجو حار الحين 🥵 تبي شي بارد؟'), findsOneWidget);
    expect(find.text('40°'), findsOneWidget);
    expect(find.text('قهوة مثلجة'), findsOneWidget);
    expect(find.text('عصير طازج'), findsOneWidget);
  });

  testWidgets('الضغط على حبّة الجو يرسل نصها كاملاً لا اسم الحبّة', (tester) async {
    // الفرق جوهري: النص المرسل يمرّ على التصنيف والبحث الفعلي، أما اسم
    // الحبّة فقصير للعرض وما يكفي كطلب بحث.
    String? sent;
    await tester.pumpWidget(
      wrap(WelcomeHero(onPickSuggestion: (p) => sent = p, weather: weather(bucket: 'hot', suggestion: hotSuggestion))),
    );
    await tester.pump();

    await tester.tap(find.text('قهوة مثلجة'));
    expect(sent, 'أقرب كافيه فيه قهوة مثلجة');
  });

  testWidgets('الاقتراحات الثابتة تبقى موجودة مع بطاقة الجو', (tester) async {
    // البطاقة تضيف خيارات، ما تستبدل الشاشة.
    await tester.pumpWidget(
      wrap(WelcomeHero(onPickSuggestion: (_) {}, weather: weather(bucket: 'hot', suggestion: hotSuggestion))),
    );
    await tester.pump();

    expect(find.text('أقرب مطعم'), findsOneWidget);
    expect(find.text('عروض قريبة'), findsOneWidget);
  });

  group('قراءة رد الخادم', () {
    test('رد بلا جو يعطي null بدل ما يرمي', () {
      expect(WeatherInfo.fromJson({'weather': null, 'suggestion': null}), isNull);
    });

    test('جو بلا اقتراح يُقرأ كاملاً مع suggestion فاضية', () {
      final info = WeatherInfo.fromJson({
        'weather': {'tempC': 33, 'condition': 'clear', 'bucket': 'mild', 'notable': false, 'descriptionAr': '33°'},
        'suggestion': null,
      });

      expect(info, isNotNull);
      expect(info!.bucket, 'mild');
      expect(info.notable, isFalse);
      expect(info.suggestion, isNull);
    });

    test('الاقتراح وحبّاته تُقرأ بترتيبها', () {
      final info = WeatherInfo.fromJson({
        'weather': {'tempC': 44, 'condition': 'clear', 'bucket': 'hot', 'notable': true, 'descriptionAr': 'الجو حار، 44°'},
        'suggestion': {
          'line': 'تبي شي بارد؟',
          'chips': [
            {'label': 'قهوة مثلجة', 'prompt': 'أقرب كافيه فيه قهوة مثلجة'},
            {'label': 'عصير', 'prompt': 'أقرب محل عصير طازج'},
          ],
        },
      });

      expect(info!.tempC, 44);
      expect(info.suggestion!.chips.map((c) => c.label), ['قهوة مثلجة', 'عصير']);
      expect(info.suggestion!.chips.first.prompt, 'أقرب كافيه فيه قهوة مثلجة');
    });
  });

  group('كشف سؤال الجو', () {
    test('الصيغ الشائعة تُلتقط بالسعودي والأردني', () {
      for (final q in ['وش الجو', 'كيف الجو اليوم', 'شلون الجو برا', 'وش الطقس', 'كم درجة الحرارة', 'فيه مطر؟']) {
        expect(IntentService.isWeatherQuestion(q), isTrue, reason: q);
      }
    });

    test('رسالة فيها طلب مكان ما تُعامل كسؤال جو', () {
      // الفخ الحقيقي: الرد بدرجة الحرارة على «الجو حار أبغى كافيه» يترك
      // المستخدم بلا كافيه.
      for (final q in ['الجو حار أبغى كافيه', 'الجو بارد وش أقرب مطعم', 'كيف الجو؟ ودّني أقرب مول']) {
        expect(IntentService.isWeatherQuestion(q), isFalse, reason: q);
      }
    });

    test('الرسائل العادية ما تُلتقط', () {
      for (final q in ['هلا', 'أقرب مطعم', 'شكراً', 'وش العروض']) {
        expect(IntentService.isWeatherQuestion(q), isFalse, reason: q);
      }
    });

    test('سؤال الجو ما عاد يرجع رد «برا الخدمة»', () {
      // كان يطابق نمط الأسئلة الخارجة عن الخدمة ويرد «ما أقدر أساعدك في هذي».
      expect(IntentService.detectOffTopicReply('وش الجو'), isNull);
      // والوقت والأخبار تبقى كما هي — ريكو فعلاً ما يعرفها.
      expect(IntentService.detectOffTopicReply('كم الساعة'), isNotNull);
    });
  });
}
