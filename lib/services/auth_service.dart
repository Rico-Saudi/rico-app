import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';
import '../models/customer.dart';

/// خطأ مصاحب لرد الخادم، برمز آلي ([code]) ورسالة عربية جاهزة للعرض.
///
/// الرمز هو ما تقرؤه الشاشات (مثل `email_not_verified` لتحويل المستخدم
/// لخطوة الرمز)، والرسالة هي ما يقرؤه المستخدم — لا تُشتق الواجهة قراراتها
/// من نص عربي قابل للتغيير.
class AuthException implements Exception {
  final String code;
  final String message;

  AuthException(this.code, this.message);

  @override
  String toString() => message;
}

/// ما يُرسل لتعيين/تعديل مهنة المستخدم. منفصل عن [ProfessionalProfile]
/// (شكل القراءة) لأن الخادم يستقبل lat/lng ويرجّع معهما اسم المهنة العربي
/// المشتقّ عنده — ما نرسله له، فهو من يملكه.
class ProfessionalUpdate {
  final String profession;
  final String? headline;

  /// "عن شغلي" — النص الطويل على البطاقة.
  final String? bio;

  final List<String> skills;
  final int? yearsExperience;

  /// سلوق لون البطاقة ([CardAccent.slug]).
  final String? cardAccent;

  final double lat;
  final double lng;
  final int serviceRadiusMeters;
  final bool isAvailable;

  const ProfessionalUpdate({
    required this.profession,
    required this.lat,
    required this.lng,
    required this.serviceRadiusMeters,
    required this.isAvailable,
    this.headline,
    this.bio,
    this.skills = const [],
    this.yearsExperience,
    this.cardAccent,
  });

  /// السيرة الذاتية غائبة عن قصد: هي ملف، فلها مسارها الخاص
  /// (`POST /professionals/me/cv`) والخادم يحملها معه عند حفظ البطاقة —
  /// فحفظ تعديل على البطاقة ما يفكّ المرفق عنها.
  Map<String, dynamic> toJson() => {
        'profession': profession,
        if (headline != null && headline!.trim().isNotEmpty) 'headline': headline!.trim(),
        if (bio != null && bio!.trim().isNotEmpty) 'bio': bio!.trim(),
        'skills': skills,
        if (yearsExperience != null) 'yearsExperience': yearsExperience,
        if (cardAccent != null) 'cardAccent': cardAccent,
        'lat': lat,
        'lng': lng,
        'serviceRadiusMeters': serviceRadiusMeters,
        'isAvailable': isAvailable,
      };
}

/// جلسة مستخدم: رمز حامل (Bearer) + بيانات الحساب.
class AuthSession {
  final String token;
  final Customer customer;

  const AuthSession({required this.token, required this.customer});
}

/// عميل `/customer/auth/*` في rico-backend — تسجيل، تفعيل بريد برمز من ٦
/// أرقام (يُرسَل عبر Resend)، دخول، ونسيان/إعادة تعيين كلمة المرور.
///
/// لا يحفظ شيئاً بنفسه: الحفظ والإعلام مسؤولية [AuthStore]، وهذا الملف
/// يبقى طبقة شبكة محضة.
class AuthService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000 (iOS Simulator/سطح
  // المكتب) أو http://10.0.2.2:3000 (Android Emulator).
  static const String _baseUrl = 'https://app.rico-go.com';

  static const Duration _timeout = Duration(seconds: 20);

  /// رسائل الأخطاء المعروفة بالعربية. أي رمز غير معروف يقع على رسالة عامة،
  /// فإضافة خطأ جديد في الخادم لا تُظهر للمستخدم رمزاً إنجليزياً.
  static const Map<String, String> _messages = {
    'invalid_credentials': 'البريد أو كلمة المرور غير صحيحة.',
    'email_already_exists': 'هذا البريد مسجّل من قبل، سجّل دخولك بدل إنشاء حساب.',
    'email_not_verified': 'لازم نفعّل بريدك أول — أرسلنا لك رمزاً جديداً.',
    'invalid_or_expired_code': 'الرمز غير صحيح أو انتهت صلاحيته.',
    'too_many_attempts': 'حاولت كثير، اطلب رمزاً جديداً.',
    'email_send_failed': 'ما قدرنا نرسل الرمز لبريدك الحين، حاول بعد شوي.',
    'phone_invalid': 'رقم الجوال غير صحيح.',
    'profession_invalid': 'المهنة المختارة غير معروفة، اختر وحدة من القائمة.',
    'service_location_invalid': 'موقع الخدمة غير صحيح، حدّده من جديد.',
    'service_radius_invalid': 'نطاق الخدمة لازم يكون بين ١ و١٠٠ كم.',
    'bio_too_long': 'وصف شغلك طويل، اختصره شوي.',
    'too_many_skills': 'المهارات كثيرة، خلّها ٨ أو أقل.',
    'skill_too_long': 'وحدة من المهارات طويلة، اختصرها.',
    'years_experience_invalid': 'سنوات الخبرة لازم تكون رقماً معقولاً.',
    'card_accent_invalid': 'لون البطاقة غير معروف.',
    'unauthorized': 'انتهت جلستك، سجّل دخولك من جديد.',
    'rate_limited': 'محاولات كثيرة، انتظر شوي وحاول مرة ثانية.',
    'network': 'ما قدرت أتصل بالخدمة، تحقق من اتصالك وحاول مرة ثانية.',
    'unknown': 'صار خلل غير متوقّع، حاول مرة ثانية.',
  };

  /// تسجيل حساب جديد — لا يُصدر جلسة: الخادم يرسل رمزاً للبريد، والجلسة
  /// تأتي من [verifyEmail] بعد إثبات ملكية البريد.
  Future<void> register({
    required String name,
    required String email,
    required String password,
    required String phone,
  }) async {
    await _post('register', {
      'name': name,
      'email': email,
      'password': password,
      'phone': phone,
      'brand': Brand.slug,
    });
  }

  Future<AuthSession> verifyEmail({required String email, required String code}) async {
    final data = await _post('verify-email', {'email': email, 'code': code});
    return _sessionFrom(data);
  }

  /// إعادة إرسال الرمز. [purpose] إما `verify_email` أو `reset_password`.
  Future<void> resendOtp({required String email, required String purpose}) async {
    await _post('resend-otp', {'email': email, 'purpose': purpose, 'brand': Brand.slug});
  }

  Future<AuthSession> login({required String email, required String password}) async {
    final data = await _post('login', {'email': email, 'password': password, 'brand': Brand.slug});
    return _sessionFrom(data);
  }

  Future<void> forgotPassword({required String email}) async {
    await _post('forgot-password', {'email': email, 'brand': Brand.slug});
  }

  Future<AuthSession> resetPassword({
    required String email,
    required String code,
    required String password,
  }) async {
    final data = await _post('reset-password', {'email': email, 'code': code, 'password': password});
    return _sessionFrom(data);
  }

  /// يتحقق أن الرمز المحفوظ ما زال صالحاً ويجلب أحدث بيانات الحساب.
  Future<Customer> me(String token) async {
    final data = await _send(() => http.get(_uri('me'), headers: _headers(token)));
    return Customer.fromJson(data);
  }

  /// تعديل الملف. [professional] له ثلاث حالات مقصودة، والفرق بينها هو كل
  /// المعنى: تركه (`clearProfessional: false` بلا قيمة) = لا تلمس المهنة،
  /// وهو ما يحصل في كل تعديل اسم/رقم عادي؛ تمريره = إضافتها أو تعديلها؛
  /// و[clearProfessional] = حذفها ("ما عدت أشتغل بهالمهنة").
  Future<Customer> updateProfile({
    required String token,
    String? name,
    String? phone,
    ProfessionalUpdate? professional,
    bool clearProfessional = false,
  }) async {
    final data = await _send(
      () => http.patch(
        _uri('me'),
        headers: _headers(token),
        body: jsonEncode({
          if (name != null) 'name': name,
          if (phone != null) 'phone': phone,
          if (clearProfessional) 'professional': null,
          if (!clearProfessional && professional != null) 'professional': professional.toJson(),
        }),
      ),
    );
    return Customer.fromJson(data);
  }

  /// يُبطل الرمز على الخادم. أي فشل هنا لا يمنع الخروج محلياً — انظر
  /// [AuthStore.signOut].
  Future<void> logout(String token) async {
    await _send(() => http.post(_uri('logout'), headers: _headers(token)));
  }

  // ─── الداخل ─────────────────────────────────────────────────────────────

  Uri _uri(String path) => Uri.parse('$_baseUrl/customer/auth/$path');

  Map<String, String> _headers([String? token]) => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) {
    return _send(() => http.post(_uri(path), headers: _headers(), body: jsonEncode(body)));
  }

  AuthSession _sessionFrom(Map<String, dynamic> data) {
    final token = data['token'] as String?;
    final customer = data['customer'] as Map<String, dynamic>?;
    if (token == null || customer == null) throw AuthException('unknown', _messages['unknown']!);
    return AuthSession(token: token, customer: Customer.fromJson(customer));
  }

  Future<Map<String, dynamic>> _send(Future<http.Response> Function() call) async {
    http.Response response;
    try {
      response = await call().timeout(_timeout);
    } catch (_) {
      throw AuthException('network', _messages['network']!);
    }

    Map<String, dynamic> body = const {};
    if (response.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (decoded is Map<String, dynamic>) body = decoded;
      } catch (_) {
        // رد غير JSON (صفحة خطأ من الوسيط مثلاً) — يُعالَج كخطأ عام أدناه.
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) return body;

    // 429 يأتي من محدّد المعدّل كنص لا كـJSON، فلا رمز فيه نقرؤه.
    if (response.statusCode == 429) {
      throw AuthException('rate_limited', _messages['rate_limited']!);
    }
    throw _errorFrom(body);
  }

  /// يقرأ شكلي الخطأ القادمين من الخادم:
  /// أخطاء الأعمال ترجع `{error: 'invalid_credentials'}` (انظر
  /// AllExceptionsFilter)، وأخطاء التحقّق من ValidationPipe ترجع
  /// `{error: 'Bad Request', message: ['phone_invalid', ...]}`. بدون قراءة
  /// الشكل الثاني كان كل خطأ تحقّق يظهر كرسالة "خلل غير متوقّع".
  AuthException _errorFrom(Map<String, dynamic> body) {
    final direct = body['error'];
    if (direct is String && _messages.containsKey(direct)) {
      return AuthException(direct, _messages[direct]!);
    }

    final details = body['message'];
    if (details is List) {
      for (final detail in details) {
        if (detail is String && _messages.containsKey(detail)) {
          return AuthException(detail, _messages[detail]!);
        }
      }
      return AuthException('validation_failed', 'تأكد من البيانات المدخلة وحاول مرة ثانية.');
    }

    return AuthException(direct is String ? direct : 'unknown', _messages['unknown']!);
  }
}
