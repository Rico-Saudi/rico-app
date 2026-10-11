import 'place_result.dart';

/// المحل اللي يقصده العميل من آخر نتائج عرضناها عليه — "بدي أطلب من الثاني"
/// أو "بدي أطلب من مطعم الماهر" والماهر بالقائمة. دالة نقية عمداً: هي اللي
/// تقرر من وين ينطلب الأكل، وغلطها يوصّل الطلب لمحل ما اختاره العميل.
///
/// الاسم يغلب الرقم إذا طابق محلاً واحداً بالقائمة: الاسم نص نقدر نتحقق منه
/// مقابل القائمة نفسها، أما الرقم فاستنتاج من المصنّف. وأي التباس (اسم يطابق
/// محلين، أو رقم برّا القائمة) يرجع null بدل التخمين — الطلب يكمل بعدها
/// بالمسار العادي، اللي يسأل أو يدوّر بالاسم.
PlaceResult? findShownShop(List<PlaceResult> shown, {int? position, String? name}) {
  if (shown.isEmpty) return null;

  final byName = name == null ? null : _matchByName(shown, name);
  if (byName != null) return byName;

  if (position != null && position >= 1 && position <= shown.length) {
    return shown[position - 1];
  }
  return null;
}

/// تطابق تام أولاً، وبعده احتواء ("الماهر" ↔ "مطعم الماهر") — بشرط محل واحد
/// بالضبط. كلمة عامة مثل "مطعم" تحتوي أسماء القائمة كلها، فما تختار شي.
PlaceResult? _matchByName(List<PlaceResult> shown, String name) {
  final wanted = _normalize(name);
  if (wanted.length < 3) return null;

  final exact = shown.where((p) => _normalize(p.name) == wanted).toList();
  if (exact.isNotEmpty) return exact.length == 1 ? exact.first : null;

  final partial = shown.where((p) {
    final candidate = _normalize(p.name);
    return candidate.contains(wanted) || wanted.contains(candidate);
  }).toList();
  return partial.length == 1 ? partial.first : null;
}

final RegExp _diacritics = RegExp('[ً-ْـ]');
final RegExp _spaces = RegExp(r'\s+');

/// يكفي لمقارنة اسم نطقه العميل باسم مكتوب بالقائمة: الهمزات والتاء المربوطة
/// والألف المقصورة والتشكيل هي اللي تختلف عادةً بين الاثنين.
String _normalize(String s) => s
    .replaceAll(_diacritics, '')
    .replaceAll(RegExp('[أإآ]'), 'ا')
    .replaceAll('ة', 'ه')
    .replaceAll('ى', 'ي')
    .replaceAll(_spaces, ' ')
    .trim()
    .toLowerCase();
