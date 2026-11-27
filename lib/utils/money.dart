import '../brand.dart';

/// تنسيق المبالغ كما يقرأها العميل.
///
/// كانت ثلاث نسخ متطابقة من [money] في ثلاثة ملفات، ورمز العملة يُلحق يدوياً
/// في كل موضع — فما كان للسوق الأردني موضعٌ واحد يُصلح فيه.

/// الرقم وحده: بلا كسور حين يكون صحيحاً، فـ«١٠» أنظف من «١٠٫٠٠».
String money(num value) {
  final v = value.toDouble();
  final rounded = v.roundToDouble();
  return v == rounded ? rounded.toStringAsFixed(0) : v.toStringAsFixed(2);
}

/// الرقم وعملة السوق: «١٠ ر.س» في السعودية، و«١٠ د.أ» في الأردن.
String priceLabel(num value) => '${money(value)} ${Brand.currency}';
