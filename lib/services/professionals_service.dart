import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../brand.dart';
import '../models/customer.dart';
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

  /// أقصى حجم للسيرة الذاتية — مطابق لـ`MAX_CV_BYTES` في الخادم. نفحصه هنا
  /// كمان عشان يوصل الرفض فوراً بدل ما يوصل بعد دقيقة رفع على شبكة جوال.
  static const int maxCvBytes = 5 * 1024 * 1024;

  /// أنواع الملفات المقبولة — PDF وصور، لأن "السيرة الذاتية" عند أغلب
  /// أصحاب المهن ورقة مصوّرة لا ملف مصدّر.
  static const List<String> allowedCvExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

  /// يحوّل مسار السيرة النسبي القادم من الخادم لرابط كامل يُفتح في المتصفح
  /// أو العارض. يترك الرابط المطلق كما هو، فلو صار الخادم يرجّع رابطاً
  /// كاملاً يوماً ما تبقى هذي صحيحة.
  static String? cvUrl(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '$_baseUrl$path';
  }

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

  /// يرفق السيرة الذاتية (PDF أو صورة) ببطاقتي المهنية، ويرجّع الحساب بعد
  /// التحديث. يستبدل المرفق السابق: الخادم يحذف البايتات القديمة، فما
  /// يتراكم عشر نسخ لمن أعاد التصوير عشر مرات.
  Future<Customer> uploadCv({required String filePath, required String token}) async {
    final file = File(filePath);
    if (!await file.exists()) {
      throw ProfessionalsException('ما لقيت الملف، اختره من جديد.');
    }
    if (await file.length() > maxCvBytes) {
      throw ProfessionalsException('الملف كبير — أقصى حجم ٥ ميجابايت.');
    }

    final extension = _extensionOf(filePath);
    if (!allowedCvExtensions.contains(extension)) {
      throw ProfessionalsException('نقبل PDF أو صورة فقط.');
    }

    http.Response response;
    try {
      final request = http.MultipartRequest('POST', Uri.parse('$_baseUrl/professionals/me/cv'))
        ..headers['Authorization'] = 'Bearer $token'
        ..files.add(await http.MultipartFile.fromPath(
          'file',
          filePath,
          // بدون تحديد صريح ترسل الحزمة application/octet-stream، وهو نوع
          // يرفضه الخادم لأنه لا يقول شيئاً عن الملف.
          contentType: _mediaTypeFor(extension),
        ));
      // أطول من بقية النداءات: هذا رفع ملف فعلي قد يصل ٥ ميجابايت.
      final streamed = await request.send().timeout(const Duration(seconds: 60));
      response = await http.Response.fromStream(streamed);
    } catch (_) {
      throw ProfessionalsException('ما قدرت أرفع الملف، تأكد من اتصالك وحاول مرة ثانية.');
    }

    if (response.statusCode == 401) throw ProfessionalsException('انتهت جلستك، سجّل دخولك من جديد.');
    if (response.statusCode == 413) throw ProfessionalsException('الملف كبير — أقصى حجم ٥ ميجابايت.');
    if (response.statusCode == 429) {
      throw ProfessionalsException('رفعت ملفات كثيرة، انتظر شوي وحاول مرة ثانية.');
    }
    if (response.statusCode == 400) {
      final error = _errorCode(response);
      if (error == 'unsupported_cv_type') throw ProfessionalsException('نقبل PDF أو صورة فقط.');
      if (error == 'professional_profile_required') {
        throw ProfessionalsException('احفظ مهنتك أول، بعدها ترفق سيرتك.');
      }
      throw ProfessionalsException('ما قدرت أرفع الملف، حاول مرة ثانية.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ProfessionalsException('ما قدرت أرفع الملف، حاول مرة ثانية.');
    }

    return Customer.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>);
  }

  /// يشيل السيرة المرفقة ويترك بقية البطاقة كما هي.
  Future<Customer> removeCv(String token) async {
    http.Response response;
    try {
      response = await http
          .delete(Uri.parse('$_baseUrl/professionals/me/cv'), headers: _headers(token))
          .timeout(_timeout);
    } catch (_) {
      throw ProfessionalsException('ما قدرت أشيل الملف، تأكد من اتصالك وحاول مرة ثانية.');
    }

    if (response.statusCode == 401) throw ProfessionalsException('انتهت جلستك، سجّل دخولك من جديد.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ProfessionalsException('ما قدرت أشيل الملف، حاول مرة ثانية.');
    }

    return Customer.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>);
  }

  /// امتداد الملف بحروف صغيرة بلا نقطة، وسلسلة فارغة لملف بلا امتداد —
  /// نشتقّه يدوياً بدل حزمة path: هذا كل ما نحتاجه منها.
  static String _extensionOf(String filePath) {
    final name = filePath.split(RegExp(r'[/\\]')).last;
    final dot = name.lastIndexOf('.');
    if (dot <= 0 || dot == name.length - 1) return '';
    return name.substring(dot + 1).toLowerCase();
  }

  static MediaType _mediaTypeFor(String extension) {
    switch (extension) {
      case 'pdf':
        return MediaType('application', 'pdf');
      case 'png':
        return MediaType('image', 'png');
      case 'webp':
        return MediaType('image', 'webp');
      default:
        return MediaType('image', 'jpeg');
    }
  }

  /// رمز الخطأ من جسم الرد إن وُجد — الخادم يرد بـ{error, ...}، وقراءته
  /// تخلي الرسالة المعروضة دقيقة بدل "ما قدرت" عامة.
  static String? _errorCode(http.Response response) {
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      return body is Map<String, dynamic> ? body['error'] as String? : null;
    } catch (_) {
      return null;
    }
  }

  Map<String, String> _headers(String token) => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };
}
