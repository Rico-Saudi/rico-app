import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_store.dart';
import '../services/backend_warmup.dart';
import '../theme/app_theme.dart';
import '../widgets/rico_logo_mark.dart';
import 'chat_screen.dart';

/// شاشة البداية.
///
/// تكمل ما تبدؤه شاشة الإقلاع الأصلية (flutter_native_splash) بنفس الأخضر
/// ونفس الشعار، فلا يرى المستخدم وميضاً أبيض بين الاثنتين، وتستغل الثانية
/// الأولى في عمل حقيقي: استرجاع جلسة الدخول المحفوظة وإيقاظ الخادم — بدلها
/// كان أول سؤال في الدردشة ينتظر خادماً نائماً.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  /// أقل مدة عرض: أقصر منها تصير الشاشة وميضاً مزعجاً على جهاز سريع، وأطول
  /// منها تصير انتظاراً بلا سبب.
  static const Duration _minimumShow = Duration(milliseconds: 1500);

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..forward();

  late final Animation<double> _markScale = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0, 0.55, curve: Curves.easeOutBack),
  );

  late final Animation<double> _textFade = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0.35, 0.8, curve: Curves.easeOut),
  );

  late final Animation<double> _tagFade = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0.55, 1, curve: Curves.easeOut),
  );

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    // الاستعادة والإحماء يجريان أثناء الحركة لا بعدها، فلا يدفع المستخدم
    // ثمن انتظارين متتاليين.
    BackendWarmup.ping();
    await Future.wait([
      AuthStore.instance.restore(),
      Future<void>.delayed(_minimumShow),
    ]);

    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 420),
        pageBuilder: (_, __, ___) => const ChatScreen(),
        // تلاشٍ لا انزلاق: الانتقال من هوية العلامة إلى المحادثة استمرار
        // لنفس المكان، لا تنقّل بين شاشتين.
        transitionsBuilder: (_, animation, __, child) => FadeTransition(opacity: animation, child: child),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      // أيقونات نظام فاتحة: الأرضية هنا خضراء داكنة، لا عاجية كبقية التطبيق.
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: RicoColors.primaryDeep,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: RicoColors.primary,
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [RicoColors.primaryLift, RicoColors.primary, RicoColors.primaryDeep],
              stops: [0, 0.45, 1],
            ),
          ),
          child: Stack(
            children: [
              const Positioned.fill(child: _GlowBackdrop()),
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ScaleTransition(
                      scale: _markScale,
                      child: FadeTransition(
                        opacity: _markScale,
                        child: Container(
                          width: 108,
                          height: 108,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.10),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
                          ),
                          child: const RicoLogoMark(height: 54, strokeWidth: 24),
                        ),
                      ),
                    ),
                    const SizedBox(height: 26),
                    FadeTransition(
                      opacity: _textFade,
                      child: Text(
                        'ريكو',
                        style: RicoText.display.copyWith(fontSize: 34, color: Colors.white),
                      ),
                    ),
                    const SizedBox(height: 10),
                    FadeTransition(
                      opacity: _tagFade,
                      child: Text(
                        'أقرب مكان وأفضل عرض، حسب موقعك',
                        style: RicoText.body.copyWith(color: Colors.white.withValues(alpha: 0.78)),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 40,
                child: FadeTransition(
                  opacity: _tagFade,
                  child: Column(
                    children: [
                      SizedBox(
                        width: 26,
                        height: 26,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white.withValues(alpha: 0.65),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'المملكة العربية السعودية',
                        style: RicoText.caption.copyWith(color: Colors.white.withValues(alpha: 0.55)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// هالتان ذهبية وبيضاء خافتتان خلف الشعار — تكسران استواء الأخضر بلا صورة
/// إضافية تثقل حزمة التطبيق.
class _GlowBackdrop extends StatelessWidget {
  const _GlowBackdrop();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(
            top: -70,
            right: -50,
            child: _Glow(size: 240, color: RicoColors.gold.withValues(alpha: 0.22)),
          ),
          Positioned(
            bottom: -60,
            left: -70,
            child: _Glow(size: 280, color: Colors.white.withValues(alpha: 0.10)),
          ),
        ],
      ),
    );
  }
}

class _Glow extends StatelessWidget {
  final double size;
  final Color color;

  const _Glow({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
      ),
    );
  }
}
