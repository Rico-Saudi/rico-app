import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/app_theme.dart';

/// حقل رمز التحقق (٦ خانات).
///
/// خلفه حقل نص واحد شفاف لا ستة حقول بستة مؤشرات تركيز: الحقل الواحد يجعل
/// اللصق من رسالة البريد يملأ الخانات كلها دفعة واحدة، ويترك الحذف والتحديد
/// يعملان كما يتوقع المستخدم — بينما ستة حقول تكسر اللصق وتحتاج قفزاً يدوياً
/// بين المؤشرات عند كل ضغطة.
class OtpField extends StatefulWidget {
  final TextEditingController controller;
  final bool enabled;

  /// يُستدعى حين تكتمل الخانات الست — إرسال تلقائي بلا ضغطة زر إضافية.
  final VoidCallback? onCompleted;

  const OtpField({
    super.key,
    required this.controller,
    this.enabled = true,
    this.onCompleted,
  });

  static const int length = 6;

  @override
  State<OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<OtpField> {
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
    _focusNode.addListener(() => setState(() {}));
    // الرمز هو الشيء الوحيد المطلوب في هذه الخطوة، ففتح لوحة المفاتيح فوراً
    // يوفّر ضغطة ولا يخفي شيئاً يحتاج المستخدم قراءته.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.enabled) _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    _focusNode.dispose();
    super.dispose();
  }

  void _onChanged() {
    setState(() {});
    if (widget.controller.text.length == OtpField.length) {
      FocusScope.of(context).unfocus();
      widget.onCompleted?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    final code = widget.controller.text;

    return Stack(
      children: [
        // الحقل الحقيقي: شفاف تماماً ويغطي مساحة الخانات، فأي نقرة عليها
        // تفتح لوحة المفاتيح.
        Positioned.fill(
          child: Opacity(
            opacity: 0,
            child: TextField(
              controller: widget.controller,
              focusNode: _focusNode,
              enabled: widget.enabled,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: OtpField.length,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(counterText: '', border: InputBorder.none),
            ),
          ),
        ),
        // الخانات دائماً بالاتجاه اليساري (LTR): الأرقام تُقرأ وتُكتب من
        // اليسار حتى داخل واجهة عربية، وعكسها يجعل الرمز يظهر مقلوباً.
        Directionality(
          textDirection: TextDirection.ltr,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < OtpField.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: _OtpBox(
                    digit: i < code.length ? code[i] : null,
                    active: _focusNode.hasFocus && i == code.length.clamp(0, OtpField.length - 1),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OtpBox extends StatelessWidget {
  final String? digit;
  final bool active;

  const _OtpBox({required this.digit, required this.active});

  @override
  Widget build(BuildContext context) {
    final filled = digit != null;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      width: 46,
      height: 56,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: filled ? RicoColors.primaryTint : RicoColors.surfaceSunken,
        borderRadius: RicoRadii.controlR,
        border: Border.all(
          color: active
              ? RicoColors.primary
              : filled
                  ? RicoColors.primaryTintStrong
                  : RicoColors.hairline,
          width: active ? 1.6 : 1,
        ),
      ),
      child: Text(
        digit ?? '',
        style: RicoText.display.copyWith(fontSize: 22, color: RicoColors.primaryDeep),
      ),
    );
  }
}
