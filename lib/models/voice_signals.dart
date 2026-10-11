import 'dart:math' as math;

/// قياسات فعلية على تسجيل المستخدم الصوتي — سرعة الكلام وعلوّ الصوت.
///
/// هذي **ليست** تحليل نبرة حقيقي: Whisper يرجّع نصاً مجرداً بلا أي بيانات
/// عن طبقة الصوت أو انفعاله، فما فيه مصدر لـ"نبرة" بالمعنى الدقيق. اللي
/// نقدر نقيسه من عندنا شيئان حقيقيان: كم بسرعة تكلّم (كلمات ÷ ثواني)، وكم
/// كان صوته عالي (متوسط السعة من [Amplitude] أثناء التسجيل). الاثنان
/// **مرجّحان** يُبعثان للمصنّف مع النص، والكلمات تبقى هي الأساس — واحد
/// يتكلم بسرعة لأنه كذا يتكلم، ما هو لأنه مستعجل.
class VoiceSignals {
  final Duration duration;

  /// متوسط مستوى الصوت ٠-١، مقيس من نفس عيّنات السعة اللي ترسم الموجة.
  final double loudness;

  /// كلمات النص المحوّل ÷ دقائق الصوت. null قبل وصول التحويل.
  final double? wordsPerMinute;

  const VoiceSignals({
    required this.duration,
    required this.loudness,
    this.wordsPerMinute,
  });

  /// يكمل القياس بعد وصول النص — سرعة الكلام ما تنحسب إلا بعد ما نعرف
  /// كم كلمة قالها فعلاً.
  VoiceSignals withTranscript(String text) {
    final minutes = duration.inMilliseconds / 60000;
    if (minutes <= 0) return this;
    final words = text.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;
    // السقف ٤٠٠ يطابق حد الخادم: قراءة مدة خاطئة تعطي رقماً خيالياً، وقصّه
    // أهون من رفض الطلب كله على مستخدم ينتظر بحثاً.
    return VoiceSignals(
      duration: duration,
      loudness: loudness,
      wordsPerMinute: math.min(400, words / minutes),
    );
  }

  Map<String, dynamic> toJson() => {
        'durationMs': duration.inMilliseconds,
        if (wordsPerMinute != null) 'wordsPerMinute': double.parse(wordsPerMinute!.toStringAsFixed(1)),
        'loudness': double.parse(loudness.toStringAsFixed(3)),
      };
}
