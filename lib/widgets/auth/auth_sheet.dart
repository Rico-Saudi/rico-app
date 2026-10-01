import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../services/auth_service.dart';
import '../../services/auth_store.dart';
import '../../theme/app_theme.dart';
import '../rico_logo_mark.dart';
import 'otp_field.dart';

/// يفتح تدفّق الدخول كورقة سفلية فوق المحادثة.
///
/// ورقة لا شاشة كاملة: الطلب يبدأ داخل الدردشة، وإبقاء المحادثة ظاهرة خلف
/// الورقة يجعل الدخول خطوة في نفس المهمة لا انتقالاً لمكان آخر يفقد فيه
/// المستخدم سياق ما كان يطلبه.
///
/// [reason] سطر يشرح لماذا طُلب الدخول الآن (مثل تأكيد طلب).
/// يرجع true إذا انتهى التدفّق بمستخدم داخل فعلاً.
Future<bool> showAuthSheet(BuildContext context, {String? reason}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: RicoColors.ink.withValues(alpha: 0.42),
    builder: (_) => AuthSheet(reason: reason),
  );
  return result ?? false;
}

enum _Step { signIn, signUp, verify, forgot, reset }

class AuthSheet extends StatefulWidget {
  final String? reason;

  const AuthSheet({super.key, this.reason});

  @override
  State<AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends State<AuthSheet> {
  final AuthService _service = AuthService();

  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _codeController = TextEditingController();

  _Step _step = _Step.signIn;
  bool _busy = false;
  bool _obscurePassword = true;
  String? _error;

  /// ثوانٍ متبقية قبل السماح بطلب رمز جديد — بلا مهلة ظاهرة يضغط المستخدم
  /// "أعد الإرسال" مراراً ويصطدم بحد المعدّل في الخادم بلا تفسير.
  int _resendIn = 0;
  Timer? _resendTimer;

  static final RegExp _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  // نفس ما يقبله الخادم (PHONE_PATTERN) — التحقق هنا توفير لرحلة شبكة، لا
  // بديل عن تحقق الخادم.
  static final RegExp _phonePattern = RegExp(r'^[+\d][\d\s()-]{6,19}$');

  @override
  void dispose() {
    _resendTimer?.cancel();
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  // ─── الانتقالات ─────────────────────────────────────────────────────────

  void _goTo(_Step step) {
    setState(() {
      _step = step;
      _error = null;
      if (step == _Step.verify || step == _Step.reset) {
        _codeController.clear();
      }
    });
    // لا نستدعي FormState.reset() هنا: هو يعيد كل حقل لقيمته الابتدائية،
    // فيمسح البريد الذي كتبه المستخدم للتو — وهو نفسه البريد الذي تعرضه
    // خطوة الرمز وتُرسل به. أخطاء الخطوة السابقة تختفي وحدها لأن كل خطوة
    // تبني حقولاً مختلفة.
  }

  void _startResendCooldown() {
    _resendTimer?.cancel();
    setState(() => _resendIn = 45);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _resendIn--);
      if (_resendIn <= 0) timer.cancel();
    });
  }

  /// يغلّف كل نداء شبكة: يمنع الإرسال المزدوج، ويحوّل [AuthException] إلى
  /// رسالة عربية داخل الورقة بدل SnackBar يختفي خلف لوحة المفاتيح.
  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await action();
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'صار خلل غير متوقّع، حاول مرة ثانية.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _adoptAndClose(AuthSession session) async {
    await AuthStore.instance.adopt(session);
    if (mounted) Navigator.of(context).pop(true);
  }

  bool get _formIsValid => _formKey.currentState?.validate() ?? false;

  void _submitSignIn() {
    if (!_formIsValid) return;
    _run(() async {
      try {
        final session = await _service.login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
        await _adoptAndClose(session);
      } on AuthException catch (e) {
        // حساب موجود ببريد غير مفعّل: الخادم أرسل رمزاً جديداً أصلاً، فنكمل
        // من خطوة الرمز بدل عرض خطأ لا يقول للمستخدم ماذا يفعل.
        if (e.code != 'email_not_verified') rethrow;
        _goTo(_Step.verify);
        _startResendCooldown();
      }
    });
  }

  void _submitSignUp() {
    if (!_formIsValid) return;
    _run(() async {
      await _service.register(
        name: _nameController.text.trim(),
        email: _emailController.text.trim(),
        password: _passwordController.text,
        phone: _phoneController.text.trim(),
      );
      _goTo(_Step.verify);
      _startResendCooldown();
    });
  }

  void _submitVerify() {
    if (_codeController.text.length != OtpField.length) return;
    _run(() async {
      final session = await _service.verifyEmail(
        email: _emailController.text.trim(),
        code: _codeController.text,
      );
      await _adoptAndClose(session);
    });
  }

  void _submitForgot() {
    if (!_formIsValid) return;
    _run(() async {
      await _service.forgotPassword(email: _emailController.text.trim());
      _goTo(_Step.reset);
      _startResendCooldown();
    });
  }

  void _submitReset() {
    if (_codeController.text.length != OtpField.length) return;
    if (!_formIsValid) return;
    _run(() async {
      final session = await _service.resetPassword(
        email: _emailController.text.trim(),
        code: _codeController.text,
        password: _passwordController.text,
      );
      await _adoptAndClose(session);
    });
  }

  void _resend() {
    if (_resendIn > 0) return;
    _run(() async {
      await _service.resendOtp(
        email: _emailController.text.trim(),
        purpose: _step == _Step.reset ? 'reset_password' : 'verify_email',
      );
      _startResendCooldown();
    });
  }

  // ─── البناء ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Padding(
      // الورقة ترتفع فوق لوحة المفاتيح بدل أن تختفي تحتها.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
        decoration: const BoxDecoration(
          color: RicoColors.canvas,
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _SheetGrip(),
                  const SizedBox(height: 16),
                  _buildHeader(),
                  const SizedBox(height: 20),
                  // AnimatedSize يجعل تغيّر ارتفاع الورقة بين الخطوات انزلاقاً
                  // ناعماً بدل قفزة مفاجئة تحت إصبع المستخدم.
                  AnimatedSize(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    alignment: Alignment.topCenter,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ..._buildStep(),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          _ErrorBanner(message: _error!),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final title = switch (_step) {
      _Step.signIn => 'سجّل دخولك',
      _Step.signUp => 'أنشئ حسابك',
      _Step.verify => 'فعّل بريدك',
      _Step.forgot => 'نسيت كلمة المرور',
      _Step.reset => 'كلمة مرور جديدة',
    };

    final subtitle = switch (_step) {
      _Step.signIn => widget.reason ?? 'ادخل بحسابك عشان نكمل طلبك.',
      _Step.signUp => 'اسمك ورقمك يوصلان للمحل مع طلبك، فلا تحتاج تكتبهما كل مرة.',
      _Step.verify => 'أرسلنا رمزاً من ٦ أرقام إلى ${_emailController.text.trim()}',
      _Step.forgot => 'اكتب بريدك ونرسل لك رمزاً لإعادة التعيين.',
      _Step.reset => 'اكتب الرمز المرسل إلى ${_emailController.text.trim()} وكلمة مرورك الجديدة.',
    };

    final canGoBack = _step != _Step.signIn;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 46,
          height: 46,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [RicoColors.primaryLift, RicoColors.primaryDeep],
            ),
            shape: BoxShape.circle,
            boxShadow: RicoShadows.brand,
          ),
          child: const RicoLogoMark(height: 22, strokeWidth: 26),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: RicoText.display.copyWith(fontSize: 20)),
              const SizedBox(height: 4),
              Text(subtitle, style: RicoText.caption.copyWith(height: 1.6)),
            ],
          ),
        ),
        if (canGoBack)
          IconButton(
            onPressed: _busy ? null : () => _goTo(_step == _Step.reset ? _Step.forgot : _Step.signIn),
            icon: const Icon(Icons.arrow_forward_rounded, size: 20),
            tooltip: 'رجوع',
            style: IconButton.styleFrom(foregroundColor: RicoColors.inkMuted),
          )
        else
          IconButton(
            onPressed: () => Navigator.of(context).pop(false),
            icon: const Icon(Icons.close_rounded, size: 20),
            tooltip: 'إغلاق',
            style: IconButton.styleFrom(foregroundColor: RicoColors.inkMuted),
          ),
      ],
    );
  }

  List<Widget> _buildStep() {
    return switch (_step) {
      _Step.signIn => _signInStep(),
      _Step.signUp => _signUpStep(),
      _Step.verify => _verifyStep(),
      _Step.forgot => _forgotStep(),
      _Step.reset => _resetStep(),
    };
  }

  List<Widget> _signInStep() => [
        _emailField(),
        const SizedBox(height: 10),
        _passwordField(textInputAction: TextInputAction.done, onSubmitted: (_) => _submitSignIn()),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton(
            onPressed: _busy ? null : () => _goTo(_Step.forgot),
            child: const Text('نسيت كلمة المرور؟'),
          ),
        ),
        const SizedBox(height: 4),
        _primaryButton(label: 'دخول', onPressed: _submitSignIn),
        const SizedBox(height: 12),
        _switchLine(
          question: 'ما عندك حساب؟',
          action: 'أنشئ حساب',
          onTap: () => _goTo(_Step.signUp),
        ),
      ];

  List<Widget> _signUpStep() => [
        TextFormField(
          controller: _nameController,
          enabled: !_busy,
          textInputAction: TextInputAction.next,
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.name],
          style: RicoText.body.copyWith(color: RicoColors.ink),
          decoration: const InputDecoration(
            labelText: 'الاسم',
            hintText: 'اسمك كما يظهر للمحل',
            prefixIcon: Icon(Icons.person_outline_rounded, size: 19),
          ),
          validator: (value) => (value ?? '').trim().length < 2 ? 'اكتب اسمك.' : null,
        ),
        const SizedBox(height: 10),
        _emailField(),
        const SizedBox(height: 10),
        TextFormField(
          controller: _phoneController,
          enabled: !_busy,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.telephoneNumber],
          // الأرقام تُكتب من اليسار حتى في واجهة عربية.
          textDirection: TextDirection.ltr,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d+\s()-]'))],
          style: RicoText.body.copyWith(color: RicoColors.ink),
          decoration: const InputDecoration(
            labelText: 'رقم الجوال',
            hintText: '05xxxxxxxx',
            prefixIcon: Icon(Icons.phone_outlined, size: 19),
          ),
          validator: (value) =>
              _phonePattern.hasMatch((value ?? '').trim()) ? null : 'اكتب رقم جوال صحيح.',
        ),
        const SizedBox(height: 10),
        _passwordField(
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submitSignUp(),
          helper: '٨ حروف/أرقام على الأقل',
        ),
        const SizedBox(height: 14),
        _primaryButton(label: 'تابع', onPressed: _submitSignUp),
        const SizedBox(height: 12),
        _switchLine(
          question: 'عندك حساب؟',
          action: 'سجّل دخولك',
          onTap: () => _goTo(_Step.signIn),
        ),
      ];

  List<Widget> _verifyStep() => [
        OtpField(controller: _codeController, enabled: !_busy, onCompleted: _submitVerify),
        const SizedBox(height: 16),
        _primaryButton(label: 'تفعيل الحساب', onPressed: _submitVerify),
        const SizedBox(height: 8),
        _resendLine(),
      ];

  List<Widget> _forgotStep() => [
        _emailField(onSubmitted: (_) => _submitForgot()),
        const SizedBox(height: 14),
        _primaryButton(label: 'أرسل الرمز', onPressed: _submitForgot),
      ];

  List<Widget> _resetStep() => [
        OtpField(controller: _codeController, enabled: !_busy),
        const SizedBox(height: 14),
        _passwordField(
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submitReset(),
          label: 'كلمة المرور الجديدة',
          helper: '٨ حروف/أرقام على الأقل',
        ),
        const SizedBox(height: 14),
        _primaryButton(label: 'احفظ وادخل', onPressed: _submitReset),
        const SizedBox(height: 8),
        _resendLine(),
      ];

  // ─── عناصر مشتركة ───────────────────────────────────────────────────────

  Widget _emailField({void Function(String)? onSubmitted}) {
    return TextFormField(
      controller: _emailController,
      enabled: !_busy,
      keyboardType: TextInputType.emailAddress,
      textInputAction: onSubmitted == null ? TextInputAction.next : TextInputAction.done,
      onFieldSubmitted: onSubmitted,
      autofillHints: const [AutofillHints.email],
      textDirection: TextDirection.ltr,
      style: RicoText.body.copyWith(color: RicoColors.ink),
      decoration: const InputDecoration(
        labelText: 'البريد الإلكتروني',
        hintText: 'name@example.com',
        prefixIcon: Icon(Icons.alternate_email_rounded, size: 19),
      ),
      validator: (value) =>
          _emailPattern.hasMatch((value ?? '').trim()) ? null : 'اكتب بريداً إلكترونياً صحيحاً.',
    );
  }

  Widget _passwordField({
    required TextInputAction textInputAction,
    void Function(String)? onSubmitted,
    String label = 'كلمة المرور',
    String? helper,
  }) {
    return TextFormField(
      controller: _passwordController,
      enabled: !_busy,
      obscureText: _obscurePassword,
      textInputAction: textInputAction,
      onFieldSubmitted: onSubmitted,
      autofillHints: const [AutofillHints.password],
      style: RicoText.body.copyWith(color: RicoColors.ink),
      decoration: InputDecoration(
        labelText: label,
        helperText: helper,
        helperStyle: RicoText.caption.copyWith(color: RicoColors.inkFaint),
        prefixIcon: const Icon(Icons.lock_outline_rounded, size: 19),
        suffixIcon: IconButton(
          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
          icon: Icon(
            _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
            size: 19,
            color: RicoColors.inkMuted,
          ),
          tooltip: _obscurePassword ? 'إظهار' : 'إخفاء',
        ),
      ),
      validator: (value) {
        // الدخول يقبل أي كلمة مرور قائمة؛ الحد الأدنى يخص ما يُنشأ الآن فقط.
        if (_step == _Step.signIn) return (value ?? '').isEmpty ? 'اكتب كلمة المرور.' : null;
        return (value ?? '').length < 8 ? 'كلمة المرور ٨ حروف على الأقل.' : null;
      },
    );
  }

  Widget _primaryButton({required String label, required VoidCallback onPressed}) {
    return ElevatedButton(
      onPressed: _busy ? null : onPressed,
      style: ElevatedButton.styleFrom(minimumSize: const Size(0, 52)),
      child: _busy
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
            )
          : Text(label, style: RicoText.button.copyWith(fontSize: 15)),
    );
  }

  Widget _switchLine({required String question, required String action, required VoidCallback onTap}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(question, style: RicoText.caption),
        TextButton(onPressed: _busy ? null : onTap, child: Text(action)),
      ],
    );
  }

  Widget _resendLine() {
    return Center(
      child: _resendIn > 0
          ? Text('تقدر تطلب رمزاً جديداً بعد $_resendIn ثانية', style: RicoText.caption)
          : TextButton.icon(
              onPressed: _busy ? null : _resend,
              icon: const Icon(Icons.refresh_rounded, size: 17),
              label: const Text('أرسل الرمز مرة ثانية'),
            ),
    );
  }
}

class _SheetGrip extends StatelessWidget {
  const _SheetGrip();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 42,
        height: 4,
        decoration: BoxDecoration(
          color: RicoColors.hairlineStrong,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  final String message;

  const _ErrorBanner({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: RicoColors.dangerTint,
        borderRadius: RicoRadii.controlR,
        border: Border.all(color: RicoColors.danger.withValues(alpha: 0.18)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, size: 17, color: RicoColors.danger),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: RicoText.caption.copyWith(color: RicoColors.danger, height: 1.55),
            ),
          ),
        ],
      ),
    );
  }
}
