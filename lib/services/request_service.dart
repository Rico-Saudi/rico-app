import 'dart:convert';
import 'package:http/http.dart' as http;

class RequestException implements Exception {
  final String message;
  RequestException(this.message);
  @override
  String toString() => message;
}

/// يرسل طلب تواصل حقيقي (اهتمام بمنتج أو عرض عند نشاط تجاري معيّن) إلى
/// rico-backend (POST /requests) — يظهر لصاحب النشاط في لوحته ليتواصل مع
/// العميل مباشرة. لا نظام دفع أو توصيل، مجرد طلب/اهتمام (lead).
class RequestService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _baseUrl = 'https://app.rico-go.com';

  /// [token] رمز حساب العميل — الخادم يأخذ منه الاسم والرقم، فلا يُرسلان في
  /// الجسم: الرقم الذي يتصل عليه المحل يجب أن يكون رقم حساب موثّق لا حقلاً
  /// حراً يُكتب مع كل طلب.
  Future<void> submitRequest({
    required String businessId,
    required String token,
    required String itemType,
    required String itemId,
  }) async {
    http.Response response;
    try {
      response = await http
          .post(
            Uri.parse('$_baseUrl/requests'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode({
              'businessId': businessId,
              'itemType': itemType,
              'itemId': itemId,
            }),
          )
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      throw RequestException('ما قدرت أرسل طلبك حالياً، تحقق من اتصالك وحاول مرة ثانية.');
    }

    // رمز منتهٍ أو مُبطَل: الرسالة تقول للمستخدم ما الذي عليه فعله، ولا
    // تختلط بفشل الشبكة العام.
    if (response.statusCode == 401) {
      throw RequestException('انتهت جلستك، سجّل دخولك من جديد وأعد التأكيد.');
    }

    if (response.statusCode != 200 && response.statusCode != 201) {
      throw RequestException('ما قدرت أرسل طلبك حالياً، حاول مرة ثانية.');
    }
  }
}
