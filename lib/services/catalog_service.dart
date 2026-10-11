import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';
import '../models/business_catalog.dart';
import '../services/intent_service.dart';

class CatalogException implements Exception {
  final String message;
  CatalogException(this.message);
  @override
  String toString() => message;
}

/// يجلب منتجات وعروض نشاط تجاري واحد من rico-backend (GET /places/:id/catalog)
/// — لعرضها داخل الدردشة عند اختيار نتيجة بحث حقيقية (source == 'rico').
class CatalogService {
  // مضيف واحد لكل الخدمات، يُبدّل من Brand.backendOrigin.
  static const String _baseUrl = Brand.backendOrigin;

  Future<BusinessCatalog> fetchCatalog(String businessId) async {
    http.Response response;
    try {
      response = await http.get(Uri.parse('$_baseUrl/places/$businessId/catalog')).timeout(const Duration(seconds: 6));
    } catch (_) {
      throw CatalogException('ما قدرت أتصل بخدمة المنتجات هلأ، جرّب مرة تانية.');
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

  /// يحوّل طلباً منطوقاً لسلّة (POST /orders/resolve): يحلّ اسم المحل، ويطابق
  /// كل صنف مع قائمته الحقيقية، ويرجع ما لم يجده صراحةً.
  ///
  /// المطابقة على الخادم لا هنا: القائمة عنده، وتطبيع العربية (الهمزات، التاء
  /// المربوطة، أل التعريف) مكتوب مرة واحدة هناك بدل نسخة في كل عميل.
  /// [placeName] للمحل اللي سمّاه العميل. وإذا ما سمّى محل، تُبعث
  /// [categorySlug] مع [lat]/[lng] والخادم يختار أقرب محل **عنده الأصناف
  /// فعلاً** — انظر PublicService.findBusinessForItems.
  Future<ResolvedOrder> resolveOrder({
    /// المحل اللي ضغطه العميل من المحلات المعروضة عليه — المعرّف لا الاسم،
    /// لأن محلين يقدرون يتشاركون اسماً والمعرّف وحده ما ينحلّ للمحل الغلط.
    String? businessId,
    String? placeName,
    String? categorySlug,
    double? lat,
    double? lng,
    required List<RequestedItem> items,
  }) async {
    http.Response response;
    try {
      response = await http
          .post(
            Uri.parse('$_baseUrl/orders/resolve'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              if (businessId != null) 'businessId': businessId,
              if (placeName != null) 'placeName': placeName,
              if (categorySlug != null) 'categorySlug': categorySlug,
              if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
              'items': items.map((i) => i.toJson()).toList(),
            }),
          )
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      throw CatalogException('ما قدرت أتصل بخدمة الطلبات هلأ، جرّب مرة تانية.');
    }

    if (response.statusCode != 200) {
      throw CatalogException('ما قدرت أجهّز طلبك هلأ، جرّب مرة تانية.');
    }

    try {
      final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      return ResolvedOrder.fromJson(data, baseUrl: _baseUrl);
    } catch (_) {
      throw CatalogException('ما قدرت أقرأ بيانات الطلب حالياً.');
    }
  }
}
