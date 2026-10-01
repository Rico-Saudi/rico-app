import 'business_card.dart';

/// الجانب المهني من نفس الحساب: المهنة التي أضافها المستخدم لملفه فصار
/// قابلاً للإيجاد حين يسأل أحد عن "أقرب دهان".
///
/// ليس نوع حساب ثانياً — من يملأه يبقى يستخدم التطبيق كعميل كما كان.
class ProfessionalProfile {
  final String profession;

  /// الاسم العربي للمهنة كما يعرفه الخادم — نأخذه منه لا من الجدول المحلي،
  /// عشان مهنة أُضيفت بعد إصدار هذي النسخة تظهر باسمها الصحيح.
  final String professionLabel;

  /// صورتي على البطاقة — مسار نسبي كما يرسله الخادم.
  final String? photoPath;

  /// سطر واحد تحت المهنة على البطاقة.
  final String? headline;

  /// "عن شغلي" — النص الطويل، مكتوباً أو مملى ومحوّلاً لنص عبر
  /// [TranscribeService].
  final String? bio;

  /// وسوم قصيرة على البطاقة.
  final List<String> skills;

  final int? yearsExperience;

  /// لون البطاقة.
  final CardAccent accent;

  /// السيرة الذاتية المرفقة — مسار نسبي كما يرسله الخادم، مع اسم الملف
  /// ونوعه. الثلاثة تتحرك معاً: إما مرفقة كاملة أو ما فيه.
  final String? cvPath;
  final String? cvFileName;
  final String? cvContentType;

  /// نقطة انطلاق الشغل (تُختار مرة، ما هي GPS حيّ) ونصف قطر الخدمة.
  final double lat;
  final double lng;
  final int serviceRadiusMeters;

  /// مفتاح صاحب المهنة نفسه: "مشغول هالفترة" بلا حذف الملف وإعادة إدخاله.
  final bool isAvailable;

  const ProfessionalProfile({
    required this.profession,
    required this.professionLabel,
    required this.lat,
    required this.lng,
    required this.serviceRadiusMeters,
    required this.isAvailable,
    this.photoPath,
    this.headline,
    this.bio,
    this.skills = const [],
    this.yearsExperience,
    this.accent = CardAccent.green,
    this.cvPath,
    this.cvFileName,
    this.cvContentType,
  });

  factory ProfessionalProfile.fromJson(Map<String, dynamic> json) => ProfessionalProfile(
        profession: json['profession'] as String,
        professionLabel: (json['professionLabel'] as String?) ?? (json['profession'] as String),
        photoPath: json['photoUrl'] as String?,
        headline: json['headline'] as String?,
        bio: json['bio'] as String?,
        skills: ((json['skills'] as List?) ?? const []).map((s) => '$s').toList(),
        yearsExperience: (json['yearsExperience'] as num?)?.round(),
        accent: CardAccent.fromSlug(json['cardAccent'] as String?),
        cvPath: json['cvUrl'] as String?,
        cvFileName: json['cvFileName'] as String?,
        cvContentType: json['cvContentType'] as String?,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        serviceRadiusMeters: (json['serviceRadiusMeters'] as num?)?.round() ?? 15000,
        isAvailable: json['isAvailable'] as bool? ?? true,
      );

  /// بطاقتي كما تُرسم في المعاينة. [name] يجي من الحساب لا من الملف
  /// المهني — الاسم واحد في المكانين، ومحفوظ مرة واحدة.
  BusinessCardData toCard({required String name, String? photoUrl, String? cvUrl}) => BusinessCardData(
        name: name,
        professionLabel: professionLabel,
        photoUrl: photoUrl,
        headline: headline,
        bio: bio,
        skills: skills,
        yearsExperience: yearsExperience,
        accent: accent,
        cvUrl: cvUrl,
        cvFileName: cvFileName,
        cvContentType: cvContentType,
        serviceRadiusMeters: serviceRadiusMeters,
      );

  Map<String, dynamic> toJson() => {
        'profession': profession,
        'professionLabel': professionLabel,
        'photoUrl': photoPath,
        'headline': headline,
        'bio': bio,
        'skills': skills,
        'yearsExperience': yearsExperience,
        'cardAccent': accent.slug,
        'cvUrl': cvPath,
        'cvFileName': cvFileName,
        'cvContentType': cvContentType,
        'lat': lat,
        'lng': lng,
        'serviceRadiusMeters': serviceRadiusMeters,
        'isAvailable': isAvailable,
      };
}

/// حساب المستخدم في التطبيق (عميل)، كما يرجعه rico-backend من
/// `/customer/auth/*`. منفصل تماماً عن حسابات لوحة التاجر/المالك.
class Customer {
  final String id;
  final String name;
  final String email;
  final String phone;

  /// null لأغلب المستخدمين — من يبحثون فقط ولا يعرضون مهنة.
  final ProfessionalProfile? professional;

  const Customer({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    this.professional,
  });

  factory Customer.fromJson(Map<String, dynamic> json) {
    final pro = json['professional'];
    return Customer(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '',
      email: (json['email'] as String?) ?? '',
      phone: (json['phone'] as String?) ?? '',
      professional: pro is Map<String, dynamic> ? ProfessionalProfile.fromJson(pro) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'professional': professional?.toJson(),
      };

  /// أول كلمة من الاسم — للترحيب المختصر في الترويسة والقوائم.
  String get firstName => name.trim().split(RegExp(r'\s+')).first;

  /// حرف واحد للأفاتار الدائري. نأخذه عبر runes لا عبر [0] لأن أول "حرف"
  /// قد يكون رمزاً خارج النطاق الأساسي (إيموجي في الاسم) فينكسر بأخذ وحدة
  /// ترميز واحدة منه.
  String get initial {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '؟';
    return String.fromCharCode(trimmed.runes.first);
  }
}
