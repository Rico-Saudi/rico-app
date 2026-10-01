import 'dart:convert';
import 'package:http/http.dart' as http;

/// يُبلغ rico-backend بأن نشاطاً تجارياً (بمعرّف Business حقيقي) ظهر للمستخدم
/// ضمن نتائج المحادثة — يُستخدم في لوحة المالك لعرض عدد مرات الظهور لكل
/// نشاط، وتحليل أداء العروض حسب نوعها إذا تضمّن الظهور عرضاً محدداً. جهد
/// أفضل (best-effort) بحت: لا يوقف أو يبطئ عرض النتائج للمستخدم، ولا يُظهر
/// أي خطأ إذا فشل الاتصال.
class ImpressionService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _baseUrl = 'https://app.rico-go.com';

  /// [businessIds]: ظهور نتائج بحث عادية (بلا عرض محدد).
  Future<void> track(List<String> businessIds) async {
    await trackItems(businessIds.map((id) => ImpressionItem(businessId: id)).toList());
  }

  /// [items]: يسمح بربط كل ظهور بعرض محدد (dealId) لتحليل أداء أنواع العروض.
  Future<void> trackItems(List<ImpressionItem> items) async {
    if (items.isEmpty) return;

    final seen = <String>{};
    final deduped = <ImpressionItem>[];
    for (final item in items) {
      final key = '${item.businessId}|${item.dealId ?? ''}';
      if (seen.add(key)) deduped.add(item);
      if (deduped.length >= 20) break;
    }

    try {
      await http
          .post(
            Uri.parse('$_baseUrl/impressions'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'items': deduped.map((i) => i.toJson()).toList()}),
          )
          .timeout(const Duration(seconds: 4));
    } catch (_) {
      // تحليلات بحتة — لا داعي لإزعاج المستخدم أو إعادة المحاولة.
    }
  }
}

class ImpressionItem {
  final String businessId;
  final String? dealId;

  ImpressionItem({required this.businessId, this.dealId});

  Map<String, dynamic> toJson() => dealId == null ? {'businessId': businessId} : {'businessId': businessId, 'dealId': dealId};
}
