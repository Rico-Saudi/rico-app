import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// نظام التصميم الموحّد لـ"ريكو" — هوية سعودية فاتحة ورسمية: أرضية عاجية
/// دافئة، الأخضر السعودي (#006C35) لوناً أساسياً، والذهبي لوناً ثانوياً
/// للتمييز (الترشيحات والعروض والتقييمات).
///
/// هذا الملف هو المصدر الوحيد للألوان والحواف والظلال وأنماط النص؛ لا يجوز
/// كتابة قيمة Hex أو ظل مباشرة داخل أي ودجت.
class RicoColors {
  RicoColors._();

  // ─── الهوية ───────────────────────────────────────────────────────────
  /// الأخضر السعودي — اللون الأساسي للعلامة.
  static const Color primary = Color(0xFF006C35);

  /// أغمق من الأساسي — للحالة المضغوطة وطرف التدرّج.
  static const Color primaryDeep = Color(0xFF00532A);

  /// أفتح من الأساسي — للطرف العلوي في التدرّجات فقط.
  static const Color primaryLift = Color(0xFF0A8443);

  /// تعبئة خفيفة بلون العلامة (خلفيات الوسوم والحبوب المفعّلة).
  static const Color primaryTint = Color(0xFFEBF4EF);
  static const Color primaryTintStrong = Color(0xFFD7E8DE);

  /// الذهبي — لون ثانوي للتمييز (زخرفي: حدود، أيقونات، شرائط).
  static const Color gold = Color(0xFFB08A2E);

  /// نسخة أغمق من الذهبي تصلح للنص الصغير على أرضية فاتحة (تباين كافٍ).
  static const Color goldInk = Color(0xFF876618);
  static const Color goldTint = Color(0xFFF8F1E1);

  // ─── الأرضيات ─────────────────────────────────────────────────────────
  /// أرضية الصفحة — عاجي دافئ لا أبيض صريح، يمنح إحساساً أرقى ويريح العين
  /// في الاستخدام الخارجي نهاراً.
  static const Color canvas = Color(0xFFFAF8F5);
  static const Color surface = Color(0xFFFFFFFF);

  /// أرضية غائرة — حقول الإدخال والحبوب غير المفعّلة.
  static const Color surfaceSunken = Color(0xFFF3F0EA);

  // ─── الحبر ────────────────────────────────────────────────────────────
  static const Color ink = Color(0xFF131A20);
  static const Color inkBody = Color(0xFF39424B);
  static const Color inkMuted = Color(0xFF6E7883);
  static const Color inkFaint = Color(0xFFA0A8B1);
  static const Color onPrimary = Color(0xFFFFFFFF);

  // ─── الخطوط الفاصلة ───────────────────────────────────────────────────
  static const Color hairline = Color(0xFFE8E3DA);
  static const Color hairlineStrong = Color(0xFFD8D2C6);

  // ─── الحالات ──────────────────────────────────────────────────────────
  static const Color success = Color(0xFF17784A);
  static const Color danger = Color(0xFFB3261E);
  static const Color dangerTint = Color(0xFFFCEDEC);
}

/// أنصاف أقطار الحواف الموحّدة.
class RicoRadii {
  RicoRadii._();

  /// فقاعة الدردشة — الزوايا الثلاث العريضة.
  static const double bubble = 20;

  /// زاوية "ذيل" الفقاعة الملاصقة للمتحدث.
  static const double bubbleTail = 6;

  static const double card = 18;
  static const double control = 12;
  static const double composer = 26;
  static const double pill = 999;

  static const BorderRadius cardR = BorderRadius.all(Radius.circular(card));
  static const BorderRadius controlR = BorderRadius.all(Radius.circular(control));
  static const BorderRadius pillR = BorderRadius.all(Radius.circular(pill));

  /// حواف فقاعة الدردشة بذيل عند جهة المتحدث (RTL: المستخدم يميناً).
  static BorderRadius bubbleFor({required bool isUser}) => BorderRadius.only(
        topRight: Radius.circular(isUser ? bubbleTail : bubble),
        topLeft: const Radius.circular(bubble),
        bottomRight: const Radius.circular(bubble),
        bottomLeft: Radius.circular(isUser ? bubble : bubbleTail),
      );
}

/// الظلال — دافئة وناعمة جداً؛ العمق يأتي من طبقتين خفيفتين لا من ظل واحد
/// قاتم، وهو ما يميّز الإحساس "المصقول" على أرضية عاجية.
class RicoShadows {
  RicoShadows._();

  static const List<BoxShadow> card = [
    BoxShadow(color: Color(0x0F171205), blurRadius: 16, offset: Offset(0, 6)),
    BoxShadow(color: Color(0x0A171205), blurRadius: 2, offset: Offset(0, 1)),
  ];

  static const List<BoxShadow> raised = [
    BoxShadow(color: Color(0x14171205), blurRadius: 24, offset: Offset(0, 10)),
    BoxShadow(color: Color(0x0A171205), blurRadius: 3, offset: Offset(0, 1)),
  ];

  static const List<BoxShadow> subtle = [
    BoxShadow(color: Color(0x0A171205), blurRadius: 8, offset: Offset(0, 2)),
  ];

  /// ظل بلون العلامة — للأزرار الأساسية والفقاعات الخضراء.
  static const List<BoxShadow> brand = [
    BoxShadow(color: Color(0x33006C35), blurRadius: 14, offset: Offset(0, 5)),
  ];
}

/// أنماط النص — مبنية على IBM Plex Sans Arabic (خط مؤسسي عربي مقروء بوزون
/// حقيقية 400/500/600/700). ارتفاع السطر مرفوع عن الافتراضي لأن الحروف
/// العربية بتشكيلها وأطرافها تحتاج تنفّساً رأسياً أكثر من اللاتينية.
class RicoText {
  RicoText._();

  static const String family = 'PlexArabic';

  static const TextStyle display = TextStyle(
    fontFamily: family,
    fontSize: 23,
    height: 1.35,
    fontWeight: FontWeight.w700,
    color: RicoColors.ink,
    letterSpacing: -0.2,
  );

  static const TextStyle title = TextStyle(
    fontFamily: family,
    fontSize: 17,
    height: 1.4,
    fontWeight: FontWeight.w600,
    color: RicoColors.ink,
  );

  static const TextStyle cardTitle = TextStyle(
    fontFamily: family,
    fontSize: 15,
    height: 1.4,
    fontWeight: FontWeight.w600,
    color: RicoColors.ink,
  );

  /// نص الرسائل — أهم نمط في التطبيق كله.
  static const TextStyle body = TextStyle(
    fontFamily: family,
    fontSize: 15,
    height: 1.65,
    fontWeight: FontWeight.w400,
    color: RicoColors.inkBody,
  );

  static const TextStyle bodyStrong = TextStyle(
    fontFamily: family,
    fontSize: 15,
    height: 1.65,
    fontWeight: FontWeight.w500,
    color: RicoColors.ink,
  );

  static const TextStyle label = TextStyle(
    fontFamily: family,
    fontSize: 13,
    height: 1.45,
    fontWeight: FontWeight.w500,
    color: RicoColors.inkBody,
  );

  static const TextStyle labelStrong = TextStyle(
    fontFamily: family,
    fontSize: 13,
    height: 1.45,
    fontWeight: FontWeight.w600,
    color: RicoColors.ink,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: family,
    fontSize: 11.5,
    height: 1.45,
    fontWeight: FontWeight.w500,
    color: RicoColors.inkMuted,
  );

  /// وسم صغير عالي الوزن — الشرائط والشِيَع (ترشيح ريكو، عرض...).
  static const TextStyle overline = TextStyle(
    fontFamily: family,
    fontSize: 11,
    height: 1.3,
    fontWeight: FontWeight.w700,
    color: RicoColors.goldInk,
    letterSpacing: 0.2,
  );

  static const TextStyle button = TextStyle(
    fontFamily: family,
    fontSize: 14,
    height: 1.2,
    fontWeight: FontWeight.w600,
  );
}

class AppTheme {
  AppTheme._();

  /// شكل شريط النظام المناسب للثيم الفاتح (أيقونات داكنة).
  static const SystemUiOverlayStyle systemOverlay = SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
    systemNavigationBarColor: RicoColors.canvas,
    systemNavigationBarIconBrightness: Brightness.dark,
  );

  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: const ColorScheme.light(
        primary: RicoColors.primary,
        onPrimary: RicoColors.onPrimary,
        primaryContainer: RicoColors.primaryTint,
        onPrimaryContainer: RicoColors.primaryDeep,
        secondary: RicoColors.gold,
        onSecondary: Colors.white,
        surface: RicoColors.surface,
        onSurface: RicoColors.ink,
        surfaceContainerHighest: RicoColors.surfaceSunken,
        outline: RicoColors.hairlineStrong,
        outlineVariant: RicoColors.hairline,
        error: RicoColors.danger,
      ),
    );

    return base.copyWith(
      scaffoldBackgroundColor: RicoColors.canvas,
      splashColor: RicoColors.primary.withValues(alpha: 0.06),
      highlightColor: RicoColors.primary.withValues(alpha: 0.04),
      textTheme: base.textTheme.apply(fontFamily: RicoText.family).copyWith(
            headlineSmall: RicoText.display,
            titleMedium: RicoText.title,
            titleSmall: RicoText.cardTitle,
            bodyMedium: RicoText.body,
            bodySmall: RicoText.caption,
            labelLarge: RicoText.label,
          ),
      appBarTheme: const AppBarTheme(
        backgroundColor: RicoColors.canvas,
        surfaceTintColor: Colors.transparent,
        foregroundColor: RicoColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: systemOverlay,
        iconTheme: IconThemeData(color: RicoColors.inkBody, size: 22),
        titleTextStyle: RicoText.title,
      ),
      dividerTheme: const DividerThemeData(
        color: RicoColors.hairline,
        thickness: 1,
        space: 1,
      ),
      iconTheme: const IconThemeData(color: RicoColors.inkBody, size: 20),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: RicoColors.primary,
        linearTrackColor: RicoColors.surfaceSunken,
        circularTrackColor: Colors.transparent,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: RicoColors.primary,
          foregroundColor: RicoColors.onPrimary,
          disabledBackgroundColor: RicoColors.surfaceSunken,
          disabledForegroundColor: RicoColors.inkFaint,
          elevation: 0,
          minimumSize: const Size(0, 46),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          textStyle: RicoText.button,
          shape: const RoundedRectangleBorder(borderRadius: RicoRadii.controlR),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: RicoColors.ink,
          backgroundColor: RicoColors.surface,
          side: const BorderSide(color: RicoColors.hairlineStrong),
          minimumSize: const Size(0, 46),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          textStyle: RicoText.button,
          shape: const RoundedRectangleBorder(borderRadius: RicoRadii.controlR),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: RicoColors.primary,
          textStyle: RicoText.label.copyWith(fontWeight: FontWeight.w600),
          minimumSize: const Size(0, 40),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: RicoColors.surfaceSunken,
        hintStyle: RicoText.body.copyWith(color: RicoColors.inkFaint),
        labelStyle: RicoText.caption,
        floatingLabelStyle: RicoText.caption.copyWith(color: RicoColors.primary),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: const OutlineInputBorder(
          borderRadius: RicoRadii.controlR,
          borderSide: BorderSide(color: RicoColors.hairline),
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: RicoRadii.controlR,
          borderSide: BorderSide(color: RicoColors.hairline),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: RicoRadii.controlR,
          borderSide: BorderSide(color: RicoColors.primary, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: RicoRadii.controlR,
          borderSide: BorderSide(color: RicoColors.danger),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: RicoColors.ink,
        contentTextStyle: RicoText.label.copyWith(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: RicoRadii.controlR),
      ),
    );
  }
}
