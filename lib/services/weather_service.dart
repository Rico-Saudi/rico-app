import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';
import '../models/weather_info.dart';

/// يجيب حالة الجو عند المستخدم من rico-backend (الذي يخفي مفتاح OpenWeather
/// ويخزّن القراءة لكل منطقة، فما تتحول كثرة المستخدمين إلى كثرة نداءات).
///
/// لا يُلقي أي استثناء أبداً: الجو زينة لا أساس، وفشل جلبه يعني إخفاء سطر
/// اقتراح — ما يعني تعطيل شاشة ولا إظهار خطأ للمستخدم.
class WeatherService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _baseUrl = 'https://app.rico-go.com';

  /// أقصر من مهلة البحث عمداً: لا يصح أن ينتظر فتح الشاشة جلب الجو.
  static const Duration _timeout = Duration(seconds: 4);

  Future<WeatherInfo?> fetch({required double lat, required double lng}) async {
    final uri = Uri.parse('$_baseUrl/weather').replace(queryParameters: {
      'lat': '$lat',
      'lng': '$lng',
      'brand': Brand.slug,
    });

    try {
      final response = await http.get(uri).timeout(_timeout);
      if (response.statusCode != 200) return null;
      return WeatherInfo.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}
