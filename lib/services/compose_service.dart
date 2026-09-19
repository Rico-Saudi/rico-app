import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';

/// يولّد رد ريكو الطبيعي (لهجة سعودية — تُفرضها تعليمات الخادم لا العميل)
/// بالاعتماد على نتائج بحث فعلية تم
/// جلبها مسبقاً (أماكن أو عروض) — عبر خادم rico-backend (NestJS + Groq).
/// لا يُلقي أي استثناء أبداً؛ عند أي عطل (شبكة/مهلة/رد غير متوقع) يرجع null
/// ليستخدم المستدعي الرد الجاهز (القالب الثابت) كخطة بديلة.
class ComposeService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000/compose (iOS
  // Simulator/سطح المكتب) أو http://10.0.2.2:3000/compose (Android Emulator).
  static const String _url = 'https://app.rico-go.com/compose';

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
