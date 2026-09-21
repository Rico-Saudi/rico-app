import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/customer_mood.dart';
import 'package:rico_app/models/voice_signals.dart';

/// الذكاء العاطفي: المزاج يغيّر **شكل** الرد لا محتواه. هذي الاختبارات
/// تحرس الحد الفاصل — أي قاعدة عرض جديدة تتعلق بالمزاج تنضاف هنا.
void main() {
  group('قراءة المزاج من رد الخادم', () {
    test('الحالات الأربع المعروفة تُقرأ بأسمائها', () {
      expect(CustomerMood.fromString('urgent'), CustomerMood.urgent);
      expect(CustomerMood.fromString('angry'), CustomerMood.angry);
      expect(CustomerMood.fromString('hesitant'), CustomerMood.hesitant);
      expect(CustomerMood.fromString('happy'), CustomerMood.happy);
    });

    // خادم أقدم من الميزة ما يرجّع الحقل أصلاً، ولازم التطبيق يشتغل معه
    // بنفس سلوكه القديم بالضبط بدل ما ينهار أو يخترع حالة.
    test('الغائب والمجهول يقرآن «عادي»', () {
      expect(CustomerMood.fromString(null), CustomerMood.neutral);
      expect(CustomerMood.fromString('furious'), CustomerMood.neutral);
      expect(CustomerMood.fromString(''), CustomerMood.neutral);
    });
  });

  group('قواعد العرض', () {
    test('المستعجل والغاضب: نتيجة وحدة، بلا جو، بلا حبّات اقتراح', () {
      for (final mood in [CustomerMood.urgent, CustomerMood.angry]) {
        expect(mood.placeLimit, 1, reason: '$mood');
        expect(mood.allowsWeatherLine, isFalse, reason: '$mood');
        expect(mood.showsQuickReplyChips, isFalse, reason: '$mood');
        expect(mood.wantsItShort, isTrue, reason: '$mood');
      }
    });

    test('المتردد: خيارات أكثر لا أقل، والحبّات تبقى', () {
      expect(CustomerMood.hesitant.placeLimit, greaterThan(1));
      expect(CustomerMood.hesitant.showsQuickReplyChips, isTrue);
      expect(CustomerMood.hesitant.wantsItShort, isFalse);
    });

    // «عادي» لازم يضل سلوك ريكو الأصلي حرفياً: بلا قص للنتائج، وبسطر الجو،
    // وبالحبّات — وإلا كانت الميزة تغيّر تجربة كل من ما انقرأ له مزاج.
    test('العادي والمبسوط: ما يتغيّر عليهم شي', () {
      for (final mood in [CustomerMood.neutral, CustomerMood.happy]) {
        expect(mood.placeLimit, isNull, reason: '$mood');
        expect(mood.allowsWeatherLine, isTrue, reason: '$mood');
        expect(mood.showsQuickReplyChips, isTrue, reason: '$mood');
      }
    });
  });

  group('قياسات الصوت', () {
    test('سرعة الكلام تُحسب من عدد الكلمات على مدة المقطع', () {
      const signals = VoiceSignals(duration: Duration(seconds: 30), loudness: 0.6);
      // ست كلمات في نصف دقيقة = ١٢ كلمة بالدقيقة.
      final withText = signals.withTranscript('أبغى سباك عندي تسريب مياه بسرعة');
      expect(withText.wordsPerMinute, closeTo(12, 0.1));
    });

    test('مدة صفرية ما ترمي ولا تعطي رقماً خيالياً', () {
      const signals = VoiceSignals(duration: Duration.zero, loudness: 0.5);
      expect(signals.withTranscript('أبغى مطعم').wordsPerMinute, isNull);
    });

    test('السرعة مقصوصة على سقف الخادم (٤٠٠)', () {
      const signals = VoiceSignals(duration: Duration(milliseconds: 200), loudness: 0.5);
      final withText = signals.withTranscript('أبغى سباك الحين');
      expect(withText.wordsPerMinute, 400);
    });

    test('الحمولة المرسلة تحمل المدة والعلوّ، وتحذف السرعة قبل التحويل', () {
      const signals = VoiceSignals(duration: Duration(seconds: 4), loudness: 0.8123);
      expect(signals.toJson(), {'durationMs': 4000, 'loudness': 0.812});
      expect(signals.withTranscript('أبغى سباك').toJson().containsKey('wordsPerMinute'), isTrue);
    });
  });
}
