/// صاحب مهنة قريب، كما يرجعه rico-backend من `GET /professionals`.
///
/// ما فيه رقم جوال ولا بريد عن قصد: الطلب يُرسل للشخص وهو يتصل بالعميل،
/// فالبحث — وأي أحد يقدر يبحث — ما يصير طريقة لحصد أرقام كل المسجّلين.
class Professional {
  final String id;
  final String name;
  final String profession;
  final String professionLabel;

  /// وصف قصير يكتبه صاحب المهنة عن شغله ("دهانات داخلية وديكورات").
  final String? headline;

  final int distanceMeters;

  /// أقصى مسافة يقبل يشتغل ضمنها — الخادم أصلاً ما يرجّع إلا من تغطيك
  /// مسافته، ونعرضها عشان يفهم المستخدم على أي أساس ظهر له.
  final int serviceRadiusMeters;

  const Professional({
    required this.id,
    required this.name,
    required this.profession,
    required this.professionLabel,
    required this.distanceMeters,
    required this.serviceRadiusMeters,
    this.headline,
  });

  factory Professional.fromJson(Map<String, dynamic> json) => Professional(
        id: json['id'] as String,
        name: (json['name'] as String?) ?? '',
        profession: (json['profession'] as String?) ?? '',
        professionLabel: (json['professionLabel'] as String?) ?? '',
        headline: json['headline'] as String?,
        distanceMeters: (json['distanceMeters'] as num?)?.round() ?? 0,
        serviceRadiusMeters: (json['serviceRadiusMeters'] as num?)?.round() ?? 0,
      );

  String get distanceLabel =>
      distanceMeters < 1000 ? '$distanceMeters م' : '${(distanceMeters / 1000).toStringAsFixed(1)} كم';

  /// حرف واحد للأفاتار — عبر runes لا عبر [0]، لنفس سبب [Customer.initial].
  String get initial {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '؟';
    return String.fromCharCode(trimmed.runes.first);
  }
}
