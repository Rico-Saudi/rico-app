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

  Future<Customer> updateProfile({
    required String token,
    String? name,
    String? phone,
  }) async {
    final data = await _send(
      () => http.patch(
        _uri('me'),
        headers: _headers(token),
        body: jsonEncode({
          if (name != null) 'name': name,
          if (phone != null) 'phone': phone,
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
