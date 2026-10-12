import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';
import '../models/web_offer.dart';
import 'intent_service.dart';

/// عروض وأسعار من الإنترنت (POST /web-offers/*) — قسم إضافي تحت عروض ريكو
/// ومقارنته، لا بديل عنهما.
///
/// ما يرمي استثناء أبداً: فشله (شبكة، سقف شهري، مفتاح ناقص) معناه إن القسم
/// ما يطلع، وعروض ريكو نفسها تكفي جواباً. خطأ هنا ما يستاهل يخرّب ردّاً صحيحاً.
class WebOffersService {
  static const String _baseUrl = 'https://app.rico-go.com';

  // أطول من باقي النداءات: الخادم يبحث بـGoogle ثم يقرا النتائج بالنموذج.
  static const Duration _timeout = Duration(seconds: 12);

  Future<List<WebOffer>> fetchDeals({required double lat, required double lng, String? topic}) async {
    final data = await _post('deals', {
      'lat': lat,
      'lng': lng,
      'brand': Brand.slug,
      if (topic != null && topic.isNotEmpty) 'topic': topic,
    });
    try {
      return ((data?['offers'] as List?) ?? [])
          .map((o) => WebOffer.fromJson(o as Map<String, dynamic>))
          .where((o) => o.url.startsWith('http'))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<List<WebPriceComparison>> fetchPrices({
    required List<RequestedItem> items,
    required double lat,
    required double lng,
  }) async {
    final data = await _post('prices', {
      'lat': lat,
      'lng': lng,
      'brand': Brand.slug,
      'items': items.take(3).map((i) => {'name': i.name}).toList(),
    });
    try {
      return ((data?['comparisons'] as List?) ?? [])
          .map((c) => WebPriceComparison.fromJson(c as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<Map<String, dynamic>?> _post(String path, Map<String, dynamic> body) async {
    try {
      final response = await http
          .post(
            Uri.parse('$_baseUrl/web-offers/$path'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(body),
          )
          .timeout(_timeout);
      if (response.statusCode != 200) return null;
      return jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
