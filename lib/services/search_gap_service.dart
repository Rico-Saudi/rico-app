import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';

/// يُبلغ rico-backend أن المستخدم بحث عن فئة نشاط تجاري (categorySlug) في
/// موقع معيّن ولم توجد نتائج — إشارة لتحديد المناطق/الفئات التي تحتاج
/// استقطاب أنشطة تجارية جديدة. جهد أفضل (best-effort) بحت، مثل
/// ImpressionService: لا يوقف أو يبطئ عرض الرد للمستخدم، ولا يُظهر أي خطأ.
class SearchGapService {
  static const String _baseUrl = Brand.apiBaseUrl;

  Future<void> track({required String categorySlug, required double lat, required double lng}) async {
    try {
      await http
          .post(
            Uri.parse('$_baseUrl/search-gaps'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'categorySlug': categorySlug, 'lat': lat, 'lng': lng}),
          )
          .timeout(const Duration(seconds: 4));
    } catch (_) {
      // تحليلات بحتة — لا داعي لإزعاج المستخدم أو إعادة المحاولة.
    }
  }
}
