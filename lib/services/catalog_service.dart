import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/business_catalog.dart';

class CatalogException implements Exception {
  final String message;
  CatalogException(this.message);
  @override
  String toString() => message;
}

/// يجلب منتجات وعروض نشاط تجاري واحد من rico-backend (GET /places/:id/catalog)
/// — لعرضها داخل الدردشة عند اختيار نتيجة بحث حقيقية (source == 'rico').
class CatalogService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _baseUrl = 'https://app.rico-go.com';

  Future<BusinessCatalog> fetchCatalog(String businessId) async {
    http.Response response;
    try {
      response = await http.get(Uri.parse('$_baseUrl/places/$businessId/catalog')).timeout(const Duration(seconds: 6));
    } catch (_) {
      throw CatalogException('ما قدرت أتصل بخدمة المنتجات حالياً، حاول مرة ثانية.');
    }

    if (response.statusCode != 200) {
      throw CatalogException('ما قدرت أجيب منتجات وعروض هذا النشاط حالياً.');
    }

    try {
      final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      return BusinessCatalog.fromJson(data, baseUrl: _baseUrl);
    } catch (_) {
      throw CatalogException('ما قدرت أقرأ بيانات المنتجات حالياً.');
    }
  }
}
