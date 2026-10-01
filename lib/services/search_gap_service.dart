import 'dart:convert';
import 'package:http/http.dart' as http;

/// يُبلغ rico-backend أن المستخدم بحث عن فئة نشاط تجاري (categorySlug) في
/// موقع معيّن ولم توجد نتائج — إشارة لتحديد المناطق/الفئات التي تحتاج
/// استقطاب أنشطة تجارية جديدة. جهد أفضل (best-effort) بحت، مثل
/// ImpressionService: لا يوقف أو يبطئ عرض الرد للمستخدم، ولا يُظهر أي خطأ.
class SearchGapService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _baseUrl = 'https://app.rico-go.com';

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
