import 'business_catalog.dart';

/// سطر واحد في سلّة نشاط تجاري — منتج أو عرض مع الكمية المطلوبة.
///
/// السعر والاسم هنا نسخة لحظة الإضافة، تُعرض للمستخدم فقط. الخادم يعيد
/// اشتقاقهما من السجل الحقيقي عند الإرسال (انظر RequestsService.resolveItems)،
/// فلا يقرّر العميل سعراً ولا اسماً.
class CartLine {
  final String itemType; // 'product' | 'deal'
  final String itemId;
  final String label;
  final String? detail;

  /// سعر الوحدة — null للعروض: "اشتري واحد والثاني مجاناً" ما له سعر مفرد
  /// يُجمع عليه.
  final double? unitPrice;

  final String? imageUrl;
  final int quantity;

  const CartLine({
    required this.itemType,
    required this.itemId,
    required this.label,
    this.detail,
    this.unitPrice,
    this.imageUrl,
    this.quantity = 1,
  });

  String get key => '$itemType:$itemId';

  double get lineTotal => (unitPrice ?? 0) * quantity;

  CartLine withQuantity(int quantity) => CartLine(
        itemType: itemType,
        itemId: itemId,
        label: label,
        detail: detail,
        unitPrice: unitPrice,
        imageUrl: imageUrl,
        quantity: quantity,
      );

  factory CartLine.fromProduct(CatalogProduct product) => CartLine(
        itemType: 'product',
        itemId: product.id,
        label: product.name,
        detail: '${product.finalPrice.toStringAsFixed(0)} ر.س',
        unitPrice: product.finalPrice,
        imageUrl: product.imageUrl,
      );

  factory CartLine.fromDeal(CatalogDeal deal) => CartLine(
        itemType: 'deal',
        itemId: deal.id,
        label: deal.titleAr,
        detail: deal.typeLabel,
      );
}

/// سلّة نشاط تجاري واحد. غير قابلة للتعديل: كل عملية تُرجع سلّة جديدة، فتبقى
/// حالة الرسالة في الدردشة قيمة واحدة تُستبدل بلا حالة مخفية تتسرّب بين
/// الرسائل.
class Cart {
  final List<CartLine> lines;

  const Cart({this.lines = const []});

  bool get isEmpty => lines.isEmpty;
  bool get isNotEmpty => lines.isNotEmpty;

  /// مجموع القطع لا عدد الأسطر — "٣ قطع" أصدق للمستخدم من "سطرين".
  int get itemCount => lines.fold(0, (sum, line) => sum + line.quantity);

  double get total => lines.fold(0, (sum, line) => sum + line.lineTotal);

  /// هل في السلّة عنصر بلا سعر (عرض)؟ عندها الإجمالي المعروض ناقص، ويُكتب
  /// بجانبه أن العروض تُحتسب عند المحل.
  bool get hasUnpricedLine => lines.any((line) => line.unitPrice == null);

  int quantityOf(String itemType, String itemId) {
    for (final line in lines) {
      if (line.itemType == itemType && line.itemId == itemId) return line.quantity;
    }
    return 0;
  }

  /// يزيد كمية سطر موجود أو يضيفه — فالضغط على "أضف" مرتين يعني قطعتين، لا
  /// سطرين متطابقين.
  Cart add(CartLine line) {
    final index = lines.indexWhere((l) => l.key == line.key);
    if (index == -1) return Cart(lines: [...lines, line]);
    final updated = [...lines];
    updated[index] = updated[index].withQuantity(updated[index].quantity + line.quantity);
    return Cart(lines: updated);
  }

  /// الكمية صفر تعني الحذف — فزر "−" عند ١ يزيل السطر بدل أن يتوقّف عنده.
  Cart setQuantity(String itemType, String itemId, int quantity) {
    final index = lines.indexWhere((l) => l.itemType == itemType && l.itemId == itemId);
    if (index == -1) return this;
    if (quantity <= 0) {
      return Cart(lines: [...lines]..removeAt(index));
    }
    final updated = [...lines];
    updated[index] = updated[index].withQuantity(quantity.clamp(1, 99));
    return Cart(lines: updated);
  }

  /// الشكل الذي يقبله POST /requests — المعرّف والكمية فقط، لأن ما عداهما
  /// يشتقّه الخادم.
  List<Map<String, dynamic>> toRequestItems() => lines
      .map((line) => {'itemType': line.itemType, 'itemId': line.itemId, 'quantity': line.quantity})
      .toList();
}
