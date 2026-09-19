import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// لون بطاقة العمل — قائمة مغلقة يختار منها صاحب المهنة، مطابقة لـ
/// `CARD_ACCENTS` في الخادم.
///
/// مغلقة لا لوناً حراً عشان كل بطاقة تبقى داخل لوحة ألوان التطبيق، فما
/// تتحول المحادثة لألبوم قصاصات. والسلوق الذي لا نعرفه (بطاقة حُفظت بلون
/// أضيف بعد هذي النسخة) يسقط على الأخضر بدل ما تنكسر البطاقة.
enum CardAccent {
  green('green', 'أخضر', RicoColors.primaryLift, RicoColors.primaryDeep, RicoColors.primaryTint),
  gold('gold', 'ذهبي', Color(0xFFC79A3A), Color(0xFF7A5A12), RicoColors.goldTint),
  midnight('midnight', 'ليلي', Color(0xFF2B3A52), Color(0xFF131D2E), Color(0xFFE9EDF4)),
  sand('sand', 'رملي', Color(0xFFB08968), Color(0xFF7A5A41), Color(0xFFF6EFE7));

  const CardAccent(this.slug, this.label, this.top, this.bottom, this.tint);

  /// ما يُرسل للخادم ويُحفظ في الملف.
  final String slug;

  /// اسم يظهر في منتقي اللون داخل ورقة التعديل.
  final String label;

  /// طرفا تدرّج ترويسة البطاقة.
  final Color top;
  final Color bottom;

  /// تعبئة خفيفة بنفس العائلة — لوسوم المهارات على أرضية بيضاء.
  final Color tint;

  static CardAccent fromSlug(String? slug) {
    for (final accent in CardAccent.values) {
      if (accent.slug == slug) return accent;
    }
    return CardAccent.green;
  }
}

/// كل ما تعرضه بطاقة العمل، مجرّداً عن مصدره.
///
/// نفس البطاقة تُرسم في مكانين لهما نموذجان مختلفان تماماً: نتيجة بحث في
/// المحادثة ([Professional])، ومعاينة ملفي أنا قبل الحفظ وبعده
/// ([ProfessionalProfile]). هذا النموذج الوسيط هو ما يمنع نسخ تصميم
/// البطاقة مرتين ثم انحرافهما عن بعض.
class BusinessCardData {
  final String name;
  final String professionLabel;

  /// سطر واحد تحت المهنة ("دهانات داخلية وديكورات").
  final String? headline;

  /// "عن شغلي" — النص الطويل، مكتوباً أو مملى ومحوّلاً لنص.
  final String? bio;

  /// وسوم قصيرة تُقرأ بلمحة حيث لا تُقرأ فقرة.
  final List<String> skills;

  final int? yearsExperience;

  final CardAccent accent;

  /// رابط السيرة الذاتية (مطلق) — null يعني ما أرفق شيئاً.
  final String? cvUrl;
  final String? cvFileName;
  final String? cvContentType;

  /// بعده عن المستخدم. null في المعاينة: بطاقتك ما لها "بُعد" عنك.
  final int? distanceMeters;

  final int? serviceRadiusMeters;

  const BusinessCardData({
    required this.name,
    required this.professionLabel,
    this.headline,
    this.bio,
    this.skills = const [],
    this.yearsExperience,
    this.accent = CardAccent.green,
    this.cvUrl,
    this.cvFileName,
    this.cvContentType,
    this.distanceMeters,
    this.serviceRadiusMeters,
  });

  bool get hasCv => cvUrl != null && cvUrl!.isNotEmpty;

  /// هل السيرة صورة؟ يقرر أيقونة الزر: ورقة لـPDF، صورة للصورة.
  bool get cvIsImage => (cvContentType ?? '').startsWith('image/');

  String? get distanceLabel {
    final meters = distanceMeters;
    if (meters == null) return null;
    return meters < 1000 ? '$meters م' : '${(meters / 1000).toStringAsFixed(1)} كم';
  }

  /// حرف واحد للأفاتار — عبر runes لا عبر [0]، فأول "حرف" قد يكون رمزاً
  /// خارج النطاق الأساسي فينكسر بأخذ وحدة ترميز واحدة منه.
  String get initial {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '؟';
    return String.fromCharCode(trimmed.runes.first);
  }
}
