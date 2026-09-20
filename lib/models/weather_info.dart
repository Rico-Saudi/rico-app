/// حالة الجو الحالية عند المستخدم، ومعها ما يقترحه ريكو بسببها.
///
/// الاقتراح يوصل جاهزاً من الخادم (نصه بلهجة العلامة، وحبّاته عبارات عربية
/// عادية) — والضغط على حبّة يرسل نصها في مسار البحث الطبيعي تماماً كأن
/// المستخدم كتبها، فما فيه خط أنابيب موازٍ ولا قواعد جديدة تُصان على حدة.
class WeatherInfo {
  final int tempC;
  final String condition;

  /// 'hot' | 'cold' | 'rain' | 'sandstorm' | 'pleasant' | 'mild'
  final String bucket;

  /// هل الجو يستاهل الذكر أصلاً؟ الخادم وحده يقرر هذا (الحر العادي بالرياض
  /// ما يستاهل)، والتطبيق ما يعيد الاجتهاد فيه.
  final bool notable;

  /// وصف قصير جاهز للعرض، مثل «الجو حار، ٤٠°».
  final String descriptionAr;

  /// سطر الاقتراح وحبّاته — null إذا كان الجو عادياً ولا يقترح شيئاً.
  final WeatherSuggestion? suggestion;

  WeatherInfo({
    required this.tempC,
    required this.condition,
    required this.bucket,
    required this.notable,
    required this.descriptionAr,
    this.suggestion,
  });

  static WeatherInfo? fromJson(Map<String, dynamic> json) {
    final weather = json['weather'] as Map<String, dynamic>?;
    if (weather == null) return null;

    final rawSuggestion = json['suggestion'] as Map<String, dynamic>?;
    return WeatherInfo(
      tempC: (weather['tempC'] as num).round(),
      condition: weather['condition'] as String? ?? '',
      bucket: weather['bucket'] as String? ?? 'mild',
      notable: weather['notable'] as bool? ?? false,
      descriptionAr: weather['descriptionAr'] as String? ?? '',
      suggestion: rawSuggestion == null ? null : WeatherSuggestion.fromJson(rawSuggestion),
    );
  }
}

class WeatherSuggestion {
  final String line;
  final List<WeatherChip> chips;

  WeatherSuggestion({required this.line, required this.chips});

  factory WeatherSuggestion.fromJson(Map<String, dynamic> json) {
    return WeatherSuggestion(
      line: json['line'] as String? ?? '',
      chips: ((json['chips'] as List?) ?? [])
          .map((c) => WeatherChip.fromJson(c as Map<String, dynamic>))
          .toList(),
    );
  }
}

class WeatherChip {
  /// النص المعروض على الحبّة.
  final String label;

  /// الرسالة التي تُرسل فعلاً عند الضغط.
  final String prompt;

  WeatherChip({required this.label, required this.prompt});

  factory WeatherChip.fromJson(Map<String, dynamic> json) {
    return WeatherChip(
      label: json['label'] as String? ?? '',
      prompt: json['prompt'] as String? ?? '',
    );
  }
}
