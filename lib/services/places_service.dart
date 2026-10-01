import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/place_result.dart';

class PlacesException implements Exception {
  final String message;
  PlacesException(this.message);
  @override
  String toString() => message;
}

/// خدمة البحث عن الأماكن — تستدعي rico-backend (GET /search)، والذي يبحث
/// أولاً بين نشاطاتنا الحقيقية (source == 'rico') ثم يكمل النقص عبر Google
/// Places إذا احتاج الأمر (source == 'google' حينها). لا بحث مباشر من
/// التطبيق لأي خدمة خارجية — المفتاح يبقى على الخادم فقط.
class PlacesService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _ricoApiBaseUrl = 'https://app.rico-go.com';

  /// [label] اسم عربي قصير للفئة الحرة (نتيجة تصنيف "other" بلا slug ثابت) —
  /// الخادم يستخدمه كنص بحث في Google Text Search، فتشتغل الفئات اللي ما لها
  /// slug عندنا. و[brandHint] و[openNow] كذلك يمرّان للخادم لأن Text Search
  /// يدعم البحث بالاسم والفلترة على المفتوح الحين (Nearby Search ما يدعمهما).
  Future<List<PlaceResult>> search({
    required double userLat,
    required double userLng,
    bool cheapest = false,
    bool openNow = false,
    bool bestRated = false,
    String? brandHint,
    String? categorySlug,
    String? label,
    int radiusMeters = 3000,
  }) async {
    // بلا فئة ولا اسم ولا وصف ما فيه شي نبحث فيه أصلاً.
    if (categorySlug == null && brandHint == null && label == null) return [];

    final uri = Uri.parse('$_ricoApiBaseUrl/search').replace(queryParameters: {
      'lat': '$userLat',
      'lng': '$userLng',
      'radius': '$radiusMeters',
      if (categorySlug != null) 'categorySlug': categorySlug,
      if (brandHint != null) 'brandHint': brandHint,
      if (label != null) 'label': label,
      'rank': openNow
          ? 'open_now'
          : bestRated
              ? 'best_rated'
              : (cheapest ? 'cheapest' : 'nearest'),
    });

    http.Response response;
    try {
      response = await http.get(uri).timeout(const Duration(seconds: 8));
    } catch (_) {
      throw PlacesException('ما قدرت أتصل بالإنترنت، تأكد من اتصالك وحاول مرة ثانية.');
    }

    if (response.statusCode != 200) {
      throw PlacesException('ما قدرت أوصل لخدمة الأماكن الحين، حاول مرة ثانية.');
    }

    final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    final places = (data['places'] as List?) ?? [];
    return places.map((p) => PlaceResult.fromRicoApiJson(p as Map<String, dynamic>, baseUrl: _ricoApiBaseUrl)).toList();
  }
}
