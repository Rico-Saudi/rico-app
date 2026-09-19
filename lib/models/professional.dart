import 'business_card.dart';

/// صاحب مهنة قريب، كما يرجعه rico-backend من `GET /professionals` — أي
/// بطاقة عمله كما نشرها هو.
///
/// ما فيه رقم جوال ولا بريد عن قصد: الطلب يُرسل للشخص وهو يتصل بالعميل،
/// فالبحث — وأي أحد يقدر يبحث — ما يصير طريقة لحصد أرقام كل المسجّلين.
/// كل ما عدا ذلك على البطاقة اختار صاحبها نشره: وصفه لشغله، مهاراته،
/// سنوات خبرته، وسيرته الذاتية.
class Professional {
  final String id;
  final String name;
  final String profession;
  final String professionLabel;

  /// وصف قصير يكتبه صاحب المهنة عن شغله ("دهانات داخلية وديكورات").
  final String? headline;

  /// "عن شغلي" — النص الطويل على البطاقة.
  final String? bio;

  final List<String> skills;
  final int? yearsExperience;

  /// لون البطاقة كما اختاره.
  final CardAccent accent;

  /// مسار السيرة الذاتية كما يرسله الخادم (نسبي: `/professionals/cv/<id>`).
  final String? cvPath;
  final String? cvFileName;
  final String? cvContentType;

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
    this.bio,
    this.skills = const [],
    this.yearsExperience,
    this.accent = CardAccent.green,
    this.cvPath,
    this.cvFileName,
    this.cvContentType,
  });

  factory Professional.fromJson(Map<String, dynamic> json) => Professional(
        id: json['id'] as String,
        name: (json['name'] as String?) ?? '',
        profession: (json['profession'] as String?) ?? '',
        professionLabel: (json['professionLabel'] as String?) ?? '',
        headline: json['headline'] as String?,
        bio: json['bio'] as String?,
        skills: ((json['skills'] as List?) ?? const []).map((s) => '$s').toList(),
        yearsExperience: (json['yearsExperience'] as num?)?.round(),
        accent: CardAccent.fromSlug(json['cardAccent'] as String?),
        cvPath: json['cvUrl'] as String?,
        cvFileName: json['cvFileName'] as String?,
        cvContentType: json['cvContentType'] as String?,
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

  /// بطاقته كما تُرسم في المحادثة. [cvUrl] مطلق — يبنيه المستدعي من عنوان
  /// الخادم لأن ما يصل من الخادم مسار نسبي.
  BusinessCardData toCard({String? cvUrl}) => BusinessCardData(
        name: name,
        professionLabel: professionLabel,
        headline: headline,
        bio: bio,
        skills: skills,
        yearsExperience: yearsExperience,
        accent: accent,
        cvUrl: cvUrl,
        cvFileName: cvFileName,
        cvContentType: cvContentType,
        distanceMeters: distanceMeters,
        serviceRadiusMeters: serviceRadiusMeters,
      );
}
