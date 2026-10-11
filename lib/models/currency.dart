/// العملة الافتراضية لهذا الإصدار. الخادم يرسل العملة مع كل سعر، لكن
/// السجلات التي كُتبت قبل إضافة الحقل ترجع بلا عملة، فتُقرأ على أنها دينار.
/// السلّة والطلبات ما تحمل عملة خاصة بها، فتُعرض بها أيضاً.
const String kDefaultCurrency = 'JOD';

const Map<String, String> _currencyLabels = {
  'JOD': 'دينار',
  'SAR': 'ريال',
};

/// اسم العملة بالعربي — رمز ISO خام ("JOD") داخل جملة عربية يُقرأ كأنه خطأ،
/// ورمز العملة المفرد (﷼ / د.ا) يلتصق بالأرقام في أحجام النص الصغيرة. أي
/// عملة غير معروفة ترجع كما هي بدل أن نخترع لها اسماً.
String currencyLabel(String? code) {
  final resolved = (code == null || code.isEmpty) ? kDefaultCurrency : code;
  return _currencyLabels[resolved] ?? resolved;
}

/// رقم المبلغ بلا عملة: بلا كسور حين يكون صحيحاً، وإلا بكسوره حتى ثلاث
/// خانات بلا أصفار زائدة. الدينار ألف فلس، وأسعار مثل ٠٫٣٥٠ و١٫٢٥ عادية —
/// تقريبها لأقرب دينار يعرض قهوة بـ٠٫٧٥ على أنها «1 دينار».
String formatAmount(double value) {
  final fixed = value.toStringAsFixed(3);
  if (!fixed.contains('.')) return fixed;
  return fixed.replaceFirst(RegExp(r'\.?0+$'), '');
}

/// المبلغ مع اسم العملة — الصياغة الوحيدة لأي سعر يُعرض في الواجهة.
String formatPrice(double value, [String? currency]) => '${formatAmount(value)} ${currencyLabel(currency)}';
