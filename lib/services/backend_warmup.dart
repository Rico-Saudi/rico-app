import 'dart:async';
import 'package:http/http.dart' as http;

/// يوقظ خادم rico-backend مبكراً.
///
/// الخادم يروح لوضع السكون عند الخمول (خطة Render)، وأول طلب بعده يستغرق
/// ١٠-٢٠ ثانية. هذا كان يخلي نداء التصنيف الذكي (LlmIntentService) يفشل
/// بالمهلة، فيسقط التطبيق للمطابقة المحلية بالكلمات المفتاحية — وتنفهم رسالة
/// مثل "هلا" كطلب مطعم. نرسل نداء خفيف على / (health: بلا قاعدة بيانات وبلا
/// LLM) أول ما تفتح الشاشة وأول ما يبدأ المستخدم يكتب، فيكون الخادم صاحياً
/// وقت الطلب الحقيقي.
class BackendWarmup {
  // نفس مضيف بقية الخدمات. للتجربة المحلية بدّلها لـ http://localhost:3000/
  static const String _url = 'https://app.rico-go.com/';

  /// أقل فاصل بين نداءين — الكتابة تطلق النداء مع كل ضغطة زر، وما لها داعي
  /// أكثر من مرة كل فترة. أقصر من مهلة سكون الخادم عشان يبقى صاحياً أثناء
  /// جلسة الاستخدام.
  static const Duration _minGap = Duration(minutes: 5);

  static DateTime? _lastPing;

  /// أفضل جهد: ما ينتظره أحد وما يرمي خطأ — نجاحه تسريع، وفشله ما يضر شي.
  static void ping() {
    final now = DateTime.now();
    if (_lastPing != null && now.difference(_lastPing!) < _minGap) return;
    _lastPing = now;
    unawaited(_fire());
  }

  static Future<void> _fire() async {
    try {
      await http.get(Uri.parse(_url)).timeout(const Duration(seconds: 25));
    } catch (_) {
      // تجاهل تماماً: الإحماء اختياري، والطلب الحقيقي له معالجته الخاصة.
    }
  }
}
