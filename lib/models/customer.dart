/// الجانب المهني من نفس الحساب: المهنة التي أضافها المستخدم لملفه فصار
/// قابلاً للإيجاد حين يسأل أحد عن "أقرب دهان".
///
/// ليس نوع حساب ثانياً — من يملأه يبقى يستخدم التطبيق كعميل كما كان.
class ProfessionalProfile {
  final String profession;

  /// الاسم العربي للمهنة كما يعرفه الخادم — نأخذه منه لا من الجدول المحلي،
  /// عشان مهنة أُضيفت بعد إصدار هذي النسخة تظهر باسمها الصحيح.
  final String professionLabel;

  final String? headline;

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
    this.headline,
  });

  factory ProfessionalProfile.fromJson(Map<String, dynamic> json) => ProfessionalProfile(
        profession: json['profession'] as String,
        professionLabel: (json['professionLabel'] as String?) ?? (json['profession'] as String),
        headline: json['headline'] as String?,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        serviceRadiusMeters: (json['serviceRadiusMeters'] as num?)?.round() ?? 15000,
        isAvailable: json['isAvailable'] as bool? ?? true,
      );

  Map<String, dynamic> toJson() => {
        'profession': profession,
        'professionLabel': professionLabel,
        'headline': headline,
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
