import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';
import '../models/profession.dart';
import '../models/professional.dart';
import '../models/professional_request.dart';

class ProfessionalsException implements Exception {
  final String message;
  ProfessionalsException(this.message);
  @override
  String toString() => message;
}

/// عميل `/professionals/*` في rico-backend: البحث عن أقرب صاحب مهنة، قائمة
/// المهن المعروفة، إرسال طلب تواصل، وصندوق الطلبات الواردة لصاحب المهنة
/// نفسه.
///
/// البحث عام بلا رمز (مثل `GET /search`)، أما الطلبات فتحتاج رمز الحساب:
/// صاحب المهنة يتصل بالرقم المرتبط بحساب موثّق، فطلب من زائر ما فيه شي
/// يُسلّم أصلاً.
class ProfessionalsService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _baseUrl = 'https://app.rico-go.com';

  static const Duration _timeout = Duration(seconds: 8);

  /// أقرب أصحاب مهنة، مرتّبين بالأقرب. القائمة قد ترجع فارغة ببساطة لأن ما
  /// فيه أحد سجّل هالمهنة في هالمنطقة بعد — وهي حالة متوقعة في بداية كل
  /// مهنة جديدة، لا خطأ.
  Future<List<Professional>> search({
    required double lat,
    required double lng,
    required String profession,
    int radiusMeters = 25000,
  }) async {
    final uri = Uri.parse('$_baseUrl/professionals').replace(queryParameters: {
      'lat': '$lat',
      'lng': '$lng',
      'profession': profession,
      'radius': '$radiusMeters',
    });

    http.Response response;
    try {
      response = await http.get(uri).timeout(_timeout);
    } catch (_) {
      throw ProfessionalsException('ما قدرت أتصل بالإنترنت، تأكد من اتصالك وحاول مرة ثانية.');
    }

    if (response.statusCode != 200) {
      throw ProfessionalsException('ما قدرت أوصل لخدمة أصحاب المهن الحين، حاول مرة ثانية.');
    }

    final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    final rows = (data['professionals'] as List?) ?? [];
    return rows.map((p) => Professional.fromJson(p as Map<String, dynamic>)).toList();
  }

  /// قائمة المهن كما يعرفها الخادم الآن، بأقسامها — تُفضَّل على النسخة
  /// المحلية في منتقي المهنة عشان مهنة أُضيفت بعد إصدار التطبيق توصل
  /// للأجهزة بلا تحديث. ترمي عند الفشل ليقرر المستدعي السقوط للنسخة المحلية.
  ///
  /// الأقسام تصل من الخادم لا تُشتقّ محلياً: لو أضاف الخادم قسماً جديداً،
  /// مهنه تظهر تحت اسمه الصحيح بدل ما تسقط في قسم "أخرى".
  Future<({List<ProfessionGroup> groups, List<Profession> professions})> fetchProfessions() async {
    http.Response response;
    try {
      response = await http.get(Uri.parse('$_baseUrl/professionals/professions')).timeout(_timeout);
    } catch (_) {
      throw ProfessionalsException('ما قدرت أجيب قائمة المهن.');
    }
    if (response.statusCode != 200) throw ProfessionalsException('ما قدرت أجيب قائمة المهن.');

    final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;

    final groups = <ProfessionGroup>[];
    final professions = <Profession>[];

    final rawGroups = data['groups'] as List?;
    if (rawGroups != null) {
      for (final raw in rawGroups) {
        final group = raw as Map<String, dynamic>;
        groups.add(ProfessionGroup.fromJson(group));
        for (final p in (group['professions'] as List?) ?? []) {
          professions.add(Profession.fromJson(p as Map<String, dynamic>, group: group['slug'] as String));
        }
      }
    } else {
      // خادم أقدم من التجميع: القائمة المسطّحة وحدها، والمنتقي يعرضها بلا
      // أقسام بدل ما يفشل.
      for (final p in (data['professions'] as List?) ?? []) {
        professions.add(Profession.fromJson(p as Map<String, dynamic>));
      }
    }

    return (groups: groups, professions: professions);
  }

  /// يرسل طلب تواصل لصاحب مهنة باسم ورقم الحساب المسجّل — لا يمرّر اسماً
  /// ولا رقماً، تماماً كما يفعل [RequestService.submitRequest].
  Future<void> submitRequest({
    required String professionalId,
    required String token,
    String? note,
    double? lat,
    double? lng,
  }) async {
    http.Response response;
    try {
      response = await http
          .post(
            Uri.parse('$_baseUrl/professionals/requests'),
            headers: _headers(token),
            body: jsonEncode({
              'professionalId': professionalId,
              'brand': Brand.slug,
              if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
              if (lat != null) 'lat': lat,
              if (lng != null) 'lng': lng,
            }),
          )
          .timeout(const Duration(seconds: 15));
    } catch (_) {
      throw ProfessionalsException('ما قدرت أرسل طلبك، تأكد من اتصالك وحاول مرة ثانية.');
    }

    if (response.statusCode == 401) {
      throw ProfessionalsException('انتهت جلستك، سجّل دخولك من جديد.');
    }
    if (response.statusCode == 404) {
      throw ProfessionalsException('هالشخص ما عاد متاح الحين 😕 جرّب واحد ثاني من القائمة.');
    }
    if (response.statusCode == 429) {
      throw ProfessionalsException('أرسلت طلبات كثيرة، انتظر شوي وحاول مرة ثانية.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ProfessionalsException('ما قدرت أرسل طلبك الحين، حاول مرة ثانية.');
    }
  }

  /// الطلبات الواردة لي كصاحب مهنة.
  Future<List<IncomingProfessionalRequest>> fetchIncoming(String token) async {
    http.Response response;
    try {
      response = await http
          .get(Uri.parse('$_baseUrl/professionals/requests/incoming'), headers: _headers(token))
          .timeout(_timeout);
    } catch (_) {
      throw ProfessionalsException('ما قدرت أجيب طلباتك، تأكد من اتصالك وحاول مرة ثانية.');
    }

    if (response.statusCode == 401) throw ProfessionalsException('انتهت جلستك، سجّل دخولك من جديد.');
    if (response.statusCode != 200) throw ProfessionalsException('ما قدرت أجيب طلباتك الحين.');

    final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    final rows = (data['requests'] as List?) ?? [];
    return rows.map((r) => IncomingProfessionalRequest.fromJson(r as Map<String, dynamic>)).toList();
  }

  Future<void> markHandled({required String requestId, required String token}) async {
    http.Response response;
    try {
      response = await http
          .patch(Uri.parse('$_baseUrl/professionals/requests/$requestId/handled'), headers: _headers(token))
          .timeout(_timeout);
    } catch (_) {
      throw ProfessionalsException('ما قدرت أحدّث حالة الطلب، حاول مرة ثانية.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ProfessionalsException('ما قدرت أحدّث حالة الطلب، حاول مرة ثانية.');
    }
  }

  Map<String, String> _headers(String token) => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };
}
