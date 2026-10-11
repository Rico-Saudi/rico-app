import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';
import '../models/customer_mood.dart';

/// يولّد رد تدلل الطبيعي (لهجة أردنية — تُفرضها تعليمات الخادم لا العميل)
/// بالاعتماد على نتائج بحث فعلية تم
/// جلبها مسبقاً (أماكن أو عروض) — عبر خادم rico-backend (NestJS + Groq).
/// لا يُلقي أي استثناء أبداً؛ عند أي عطل (شبكة/مهلة/رد غير متوقع) يرجع null
/// ليستخدم المستدعي الرد الجاهز (القالب الثابت) كخطة بديلة.
class ComposeService {
  // مضيف واحد لكل الخدمات، يُبدّل من Brand.backendOrigin.
  static const String _url = '${Brand.backendOrigin}/compose';

  static Future<String?> composeReply({
    required String message,
    required String intentKind,
    required String intentLabel,
    required String rank,
    required List<Map<String, dynamic>> items,
    required bool truncated,
    List<Map<String, String>>? history,
    double? lat,
    double? lng,
    CustomerMood mood = CustomerMood.neutral,
  }) async {
    try {
      final response = await http
          .post(
            Uri.parse(_url),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'message': message,
              'brand': Brand.slug,
              'intentKind': intentKind,
              'intentLabel': intentLabel,
              'rank': rank,
              'items': items,
              'truncated': truncated,
              if (history != null && history.isNotEmpty) 'history': history,
              // موقع المستخدم — يستخدمه الخادم ليعرف حالة الجو ويذكرها في
              // الرد إذا كانت تستاهل الذكر. اختياري: بدونه يُصاغ الرد كما كان.
              if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
              // «عادي» هو سلوك الخادم الافتراضي أصلاً، فما نبعثه — أقل حقل
              // بالحمولة وأقل تعليمة يقرأها النموذج بلا داعي.
              if (mood != CustomerMood.neutral) 'mood': mood.wireValue,
            }),
          )
          .timeout(const Duration(seconds: 5));

      if (response.statusCode != 200) return null;

      final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final reply = data['reply'] as String?;
      return (reply != null && reply.trim().isNotEmpty) ? reply : null;
    } catch (_) {
      return null;
    }
  }
}
