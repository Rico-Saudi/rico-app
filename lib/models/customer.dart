/// حساب المستخدم في التطبيق (عميل)، كما يرجعه rico-backend من
/// `/customer/auth/*`. منفصل تماماً عن حسابات لوحة التاجر/المالك.
class Customer {
  final String id;
  final String name;
  final String email;
  final String phone;

  const Customer({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
  });

  factory Customer.fromJson(Map<String, dynamic> json) {
    return Customer(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '',
      email: (json['email'] as String?) ?? '',
      phone: (json['phone'] as String?) ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
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
