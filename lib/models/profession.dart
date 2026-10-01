/// قسم في منتقي المهن (البناء، الكهرباء، السيارات...). وجوده ضروري بعد ما
/// صارت القائمة بالمئات: قائمة مسطّحة بهذا الطول ما تُتصفّح، تُبحث فقط.
class ProfessionGroup {
  final String slug;
  final String label;

  const ProfessionGroup({required this.slug, required this.label});

  factory ProfessionGroup.fromJson(Map<String, dynamic> json) => ProfessionGroup(
        slug: json['slug'] as String,
        label: json['label'] as String,
      );
}

/// مهنة يقدر الشخص يضيفها لملفه فيصير قابلاً للإيجاد حين يسأل أحد عن
/// "أقرب دهان". نسخة مطابقة لقائمة الخادم
/// (server/rico-backend/src/professionals/constants/professions.ts) — أي
/// مهنة تُضاف هناك تُضاف هنا كذلك، وإلا توقّف المطابقة المحلية بالكلمات عن
/// التعرّف عليها حين يتعذّر الوصول للمصنّف.
class Profession {
  /// معرّف ثابت لا يتغيّر — محفوظ في ملفات المستخدمين.
  final String slug;

  /// الاسم العربي المعروض.
  final String label;

  /// سلوق القسم الذي تظهر تحته في المنتقي.
  final String group;

  /// صيغ يكتبها الناس فعلاً — للمطابقة المحلية بالكلمات المفتاحية فقط،
  /// فالخادم ما يرسلها.
  final List<String> aliases;

  const Profession({
    required this.slug,
    required this.label,
    this.group = '',
    this.aliases = const [],
  });

  factory Profession.fromJson(Map<String, dynamic> json, {String group = ''}) => Profession(
        slug: json['slug'] as String,
        label: json['label'] as String,
        group: (json['group'] as String?) ?? group,
      );
}
