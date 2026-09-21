import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/services/intent_service.dart';

String route(String t) {
  if (IntentService.hasSearchSignal(t)) {
    final i = IntentService.parseMulti(t);
    return 'SEARCH  → ${i.map((x) => x.slug ?? x.profession ?? x.label).join(', ')}';
  }
  final r = IntentService.detectOffTopicReply(t);
  if (r != null) return 'CHAT    → ${r.split('\n').first}';
  return 'CLARIFY → (ما فهمها)';
}

void main() {
  test('probe', () {
    const battery = <String, List<String>>{
      'حاجة جسدية': ['أنا جوعان', 'جعان موت', 'عطشان', 'بدي آكل', 'ناقصني قهوة', 'البنزين خلصان', 'سيارتي واقفة', 'بدي أحلق', 'بدي دواء'],
      'مشاعر': ['انا زعلان', 'انا رهقان', 'تعبان', 'متوتر', 'مضغوط من الشغل', 'مبسوط', 'فرحان نجحت', 'مخنوق', 'مهموم', 'بردان', 'حران', 'قلقان', 'نفسيتي تعبانة'],
      'ملتبس': ['زعلان وبدي كافيه', 'تعبان وبدي كافيه', 'جوعان بس ما بدي مطعم', 'أنا مريض', 'راسي بوجعني', 'مريض وبدي صيدلية'],
      'ضيق شديد': ['تعبت من حياتي', 'مليت من حياتي', 'أبي أموت', 'بدي أموت', 'ما بدي أعيش', 'بدي أأذي حالي'],
      'تصادمات محتملة': ['بدي محل مكسرات', 'أقرب كلية تمريض', 'بدي أموت من الجوع', 'بدي أموت من الضحك', 'الجو حار', 'مليت', 'طفشان', 'وحيد', 'محل تحف'],
      'دردشة': ['هلا', 'شكراً', 'مين أنت', 'في توصيل', 'كم الساعة'],
      'بحث': ['أقرب مطعم', 'أرخص كافيه', 'بدي دهّين', 'بدي فنيين'],
    };
    for (final e in battery.entries) {
      // ignore: avoid_print
      print('\n### ${e.key}');
      for (final m in e.value) {
        // ignore: avoid_print
        print('  ${m.padRight(24)} ${route(m)}');
      }
    }
  });
}
