import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/customer.dart';
import 'auth_service.dart';

/// حالة الدخول في التطبيق كله — مصدر واحد للحقيقة يستمع له أي ودجت عبر
/// [ListenableBuilder].
///
/// نسخة وحيدة ([instance]) بدل حزمة إدارة حالة: التطبيق ما فيه إلا هذه
/// الحالة العامة، وإضافة اعتمادية كاملة لأجلها مبالغة.
///
/// الرمز يُحفظ في مخزن مفاتيح النظام (Keychain بآيفون، وتخزين مشفّر
/// بأندرويد) لا في SharedPreferences: ملف التفضيلات نص صريح يطلع بنسخة
/// احتياطية للجهاز أو بجهاز مكسور الحماية، والرمز يفتح طلبات العميل ورقمه.
/// الملف الشخصي (الاسم والرقم المعروضين) يظل بالتفضيلات — مو سرّ.
///
/// الرموز المحفوظة قبل هذا بالتفضيلات تنتقل بصمت عند أول تشغيل، فما يطلع
/// أحد من حسابه بسبب التحديث. ولو مخزن النظام نفسه تعطّل (يصير ببعض أجهزة
/// أندرويد) نرجع للتفضيلات بدل ما نضيّع الجلسة.
class AuthStore extends ChangeNotifier {
  AuthStore._();

  static final AuthStore instance = AuthStore._();

  static const _tokenKey = 'customer_auth_token';
  static const _customerKey = 'customer_auth_profile';

  final AuthService _service = AuthService();

  static const FlutterSecureStorage _vault = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  /// يقرأ الرمز من المخزن الآمن، وينقل أي رمز قديم من التفضيلات له.
  Future<String?> _readToken(SharedPreferences prefs) async {
    final legacy = prefs.getString(_tokenKey);
    try {
      final secure = await _vault.read(key: _tokenKey);
      if (secure != null) {
        if (legacy != null) await prefs.remove(_tokenKey);
        return secure;
      }
      if (legacy != null) {
        await _vault.write(key: _tokenKey, value: legacy);
        await prefs.remove(_tokenKey);
      }
      return legacy;
    } catch (_) {
      return legacy;
    }
  }

  Future<void> _writeToken(SharedPreferences prefs, String token) async {
    try {
      await _vault.write(key: _tokenKey, value: token);
      await prefs.remove(_tokenKey);
    } catch (_) {
      await prefs.setString(_tokenKey, token);
    }
  }

  String? _token;
  Customer? _customer;
  bool _restored = false;

  Customer? get customer => _customer;
  bool get isSignedIn => _token != null && _customer != null;

  /// هل انتهت محاولة استرجاع الجلسة المحفوظة؟ تمنع شاشة البداية من الانتقال
  /// قبل معرفة حالة الدخول.
  bool get isRestored => _restored;

  /// الرمز الحامل للنداءات المُصادَقة (مثل POST /requests). null = زائر.
  String? get token => _token;

  /// يستعيد الجلسة المحفوظة عند إقلاع التطبيق.
  ///
  /// يعرض الملف المحفوظ محلياً فوراً ثم يتحقق من الخادم في الخلفية: بلا
  /// العرض الفوري تصير شاشة البداية رهينة الشبكة، وبلا التحقق يبقى المستخدم
  /// "داخلاً" بعد إبطال رمزه (تغيير كلمة المرور من جهاز آخر مثلاً) حتى أول
  /// طلب يفشل.
  Future<void> restore() async {
    if (_restored) return;

    final prefs = await SharedPreferences.getInstance();
    final token = await _readToken(prefs);
    final rawCustomer = prefs.getString(_customerKey);

    if (token != null && rawCustomer != null) {
      try {
        _customer = Customer.fromJson(jsonDecode(rawCustomer) as Map<String, dynamic>);
        _token = token;
      } catch (_) {
        await _clear(prefs);
      }
    }

    _restored = true;
    notifyListeners();

    if (_token != null) unawaited(_refreshProfile());
  }

  /// يحفظ جلسة جديدة بعد تسجيل دخول/تفعيل/إعادة تعيين ناجحة.
  Future<void> adopt(AuthSession session) async {
    _token = session.token;
    _customer = session.customer;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await _writeToken(prefs, session.token);
    await prefs.setString(_customerKey, jsonEncode(session.customer.toJson()));
  }

  Future<void> updateProfile({
    String? name,
    String? phone,
    ProfessionalUpdate? professional,
    bool clearProfessional = false,
  }) async {
    final token = _token;
    if (token == null) throw AuthException('unauthorized', 'انتهت جلستك، سجّل دخولك من جديد.');

    final updated = await _service.updateProfile(
      token: token,
      name: name,
      phone: phone,
      professional: professional,
      clearProfessional: clearProfessional,
    );
    _customer = updated;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_customerKey, jsonEncode(updated.toJson()));
  }

  /// يستبدل الحساب المحفوظ بنسخة وصلت من مسار آخر غير `PATCH /me` — رفع
  /// السيرة الذاتية وحذفها يرجّعان الحساب كاملاً، فالحفظ هنا يخلي البطاقة
  /// المعروضة تطابق الخادم بلا نداء ثانٍ.
  Future<void> adoptCustomer(Customer customer) async {
    _customer = customer;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_customerKey, jsonEncode(customer.toJson()));
  }

  /// خروج محلي فوري، وإبطال الرمز على الخادم كأفضل جهد: لو فشلت الشبكة
  /// فالمستخدم خرج فعلاً من جهازه — أسوأ حالة رمز يبقى صالحاً على الخادم
  /// حتى انتهاء صلاحيته، وهو أهون من زر خروج لا يخرج.
  Future<void> signOut() async {
    final token = _token;
    _token = null;
    _customer = null;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await _clear(prefs);

    if (token != null) {
      try {
        await _service.logout(token);
      } catch (_) {
        // تجاهل: الخروج المحلي تم.
      }
    }
  }

  Future<void> _refreshProfile() async {
    final token = _token;
    if (token == null) return;

    try {
      final customer = await _service.me(token);
      _customer = customer;
      notifyListeners();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_customerKey, jsonEncode(customer.toJson()));
    } on AuthException catch (e) {
      // رمز مرفوض = جلسة انتهت فعلاً؛ أما انقطاع الشبكة فلا يبرّر إخراج
      // المستخدم — يبقى داخلاً بملفه المحفوظ حتى تعود الشبكة.
      if (e.code == 'unauthorized') await signOut();
    } catch (_) {
      // لا شيء: بقاء الجلسة المحفوظة أسلم من إخراج المستخدم لخطأ عابر.
    }
  }

  Future<void> _clear(SharedPreferences prefs) async {
    await prefs.remove(_tokenKey);
    await prefs.remove(_customerKey);
    try {
      await _vault.delete(key: _tokenKey);
    } catch (_) {
      // المخزن معطّل: ما فيه شي محفوظ فيه أصلاً.
    }
  }
}
