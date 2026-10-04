import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/customer_order.dart';

class RequestException implements Exception {
  final String message;
  RequestException(this.message);
  @override
  String toString() => message;
}

/// يرسل طلباً حقيقياً (سلّة منتجات/عروض من نشاط تجاري واحد) إلى rico-backend
/// (POST /requests) — يظهر لصاحب النشاط في لوحته ليتواصل مع العميل مباشرة.
/// لا نظام دفع أو توصيل، مجرد طلب/اهتمام (lead).
class RequestService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _baseUrl = 'https://app.rico-go.com';

  /// [token] رمز حساب العميل — الخادم يأخذ منه الاسم والرقم، فلا يُرسلان في
  /// الجسم: الرقم الذي يتصل عليه المحل يجب أن يكون رقم حساب موثّق لا حقلاً
  /// حراً يُكتب مع كل طلب.
  /// [items] أسطر السلّة كما يبنيها [Cart.toRequestItems] — معرّف وكمية فقط:
  /// الاسم والسعر يشتقّهما الخادم من المنتج الحقيقي، فلا يسعّر العميل لنفسه.
  Future<void> submitRequest({
    required String businessId,
    required String token,
    required List<Map<String, dynamic>> items,
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
              'items': items,
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

    // المحل أوقف الطلبات مؤقتاً: نقول للعميل هذا بالذات، ومتى يرجع وكلمة
    // المحل إن كتب، بدل «حاول مرة ثانية» اللي ما راح تنفع.
    if (response.statusCode == 409) {
      final paused = ordersPausedMessage(utf8.decode(response.bodyBytes));
      if (paused != null) throw RequestException(paused);
    }

    if (response.statusCode != 200 && response.statusCode != 201) {
      throw RequestException('ما قدرت أرسل طلبك حالياً، حاول مرة ثانية.');
    }
  }

  /// نص رفض «المحل موقف الطلبات» من جسم رد 409، أو null لأي رفض ثاني.
  static String? ordersPausedMessage(String body, {DateTime? now}) {
    Map<String, dynamic> data;
    try {
      data = jsonDecode(body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
    if (data['error'] != 'orders_paused') return null;

    final buffer = StringBuffer('المحل موقف استقبال الطلبات مؤقتاً');
    final resumesAt = DateTime.tryParse(data['resumesAt'] as String? ?? '')?.toLocal();
    if (resumesAt != null) {
      final today = now ?? DateTime.now();
      final sameDay = resumesAt.year == today.year && resumesAt.month == today.month && resumesAt.day == today.day;
      final h = resumesAt.hour % 12 == 0 ? 12 : resumesAt.hour % 12;
      final m = resumesAt.minute.toString().padLeft(2, '0');
      final period = resumesAt.hour < 12 ? 'ص' : 'م';
      buffer.write(sameDay ? '، يرجع الساعة $h:$m$period' : '، يرجع ${resumesAt.day}/${resumesAt.month} الساعة $h:$m$period');
    }
    buffer.write('.');
    final note = (data['note'] as String?)?.trim();
    if (note != null && note.isNotEmpty) buffer.write(' «$note»');
    buffer.write(' جرّب محل ثاني أو ارجع له بعدين.');
    return buffer.toString();
  }

  /// سجلّ طلبات العميل (GET /requests/mine) — الأحدث أولاً.
  Future<List<CustomerOrder>> fetchMyOrders(String token) async {
    http.Response response;
    try {
      response = await http.get(
        Uri.parse('$_baseUrl/requests/mine'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 8));
    } catch (_) {
      throw RequestException('ما قدرت أجيب طلباتك، تأكد من اتصالك وحاول مرة ثانية.');
    }

    if (response.statusCode == 401) {
      throw RequestException('انتهت جلستك، سجّل دخولك من جديد.');
    }
    if (response.statusCode != 200) {
      throw RequestException('ما قدرت أجيب طلباتك الحين، حاول مرة ثانية.');
    }

    try {
      final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      return ((data['orders'] as List?) ?? [])
          .map((o) => CustomerOrder.fromJson(o as Map<String, dynamic>, baseUrl: _baseUrl))
          .toList();
    } catch (_) {
      throw RequestException('ما قدرت أقرأ بيانات طلباتك حالياً.');
    }
  }
}
