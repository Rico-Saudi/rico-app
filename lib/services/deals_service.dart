import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/deal.dart';

class DealsException implements Exception {
  final String message;
  DealsException(this.message);
  @override
  String toString() => message;
}

/// يجلب العروض/الخصومات القريبة من rico-backend (خادم NestJS، انظر
/// server/rico-backend — يستبدل rico-api/groq-proxy القديمة).
class DealsService {
  // للتجربة المحلية استخدم http://localhost:3000 على iOS Simulator/سطح
  // المكتب، أو http://10.0.2.2:3000 على Android Emulator (localhost يشير
  // لجهاز المحاكي نفسه لا لجهازك).
  static const String _baseUrl = 'https://app.rico-go.com';

  Future<List<Deal>> fetchNearby({
    required double lat,
    required double lng,
    int radiusMeters = 3000,
  }) async {
    final uri = Uri.parse('$_baseUrl/deals').replace(queryParameters: {
      'lat': '$lat',
      'lng': '$lng',
      'radius': '$radiusMeters',
    });

    http.Response response;
    try {
      response = await http.get(uri).timeout(const Duration(seconds: 6));
    } catch (_) {
      throw DealsException('ما قدرت أتصل بخدمة العروض حالياً، حاول مرة ثانية.');
    }

    if (response.statusCode != 200) {
      throw DealsException('ما قدرت أجيب العروض حالياً (رمز ${response.statusCode}).');
    }

    try {
      final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final deals = (data['deals'] as List?) ?? [];
      return deals
          .map((d) => Deal.fromJson(d as Map<String, dynamic>))
          .toList();
    } catch (_) {
      throw DealsException('ما قدرت أقرأ بيانات العروض حالياً.');
    }
  }
}
