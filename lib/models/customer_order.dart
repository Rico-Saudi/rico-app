/// سطر في طلب سابق — لقطة وقت الطلب لا حالة المنتج اليوم: الاسم والسعر
/// محفوظان في الطلب نفسه، فتعديل المحل لسعره لاحقاً لا يعيد كتابة ما طلبه
/// العميل فعلاً.
class OrderLine {
  final String itemType; // 'product' | 'deal'
  final String label;
  final String? detail;
  final double? unitPrice;
  final String? imageUrl;
  final int quantity;

  const OrderLine({
    required this.itemType,
    required this.label,
    this.detail,
    this.unitPrice,
    this.imageUrl,
    this.quantity = 1,
  });

  bool get isDeal => itemType == 'deal';

  double get lineTotal => (unitPrice ?? 0) * quantity;

  factory OrderLine.fromJson(Map<String, dynamic> json, {String baseUrl = ''}) {
    final imagePath = json['imageUrl'] as String?;
    return OrderLine(
      itemType: json['itemType'] as String? ?? 'product',
      label: json['label'] as String? ?? '',
      detail: json['detail'] as String?,
      unitPrice: (json['unitPrice'] as num?)?.toDouble(),
      imageUrl: imagePath == null ? null : '$baseUrl$imagePath',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
    );
  }
}

enum OrderStatus { pending, handled }

/// طلب سابق أرسله العميل لمحل واحد، كما يرجعه GET /requests/mine.
class CustomerOrder {
  final String id;
  final String? businessId;
  final String businessName;
  final String? businessPhone;
  final List<OrderLine> lines;
  final double total;
  final OrderStatus status;
  final DateTime createdAt;

  const CustomerOrder({
    required this.id,
    this.businessId,
    required this.businessName,
    this.businessPhone,
    required this.lines,
    required this.total,
    required this.status,
    required this.createdAt,
  });

  int get itemCount => lines.fold(0, (sum, line) => sum + line.quantity);

  /// العروض بلا سعر مفرد، فالإجمالي المعروض ناقص ويُقال ذلك بدل رقم يبدو
  /// نهائياً ثم يفاجئ العميلَ المحلُّ بغيره.
  bool get hasUnpricedLine => lines.any((line) => line.unitPrice == null);

  /// رقم قصير يقرأه العميل للمحل بدل معرّف من ٢٤ خانة.
  String get reference => id.length <= 6 ? id.toUpperCase() : id.substring(id.length - 6).toUpperCase();

  factory CustomerOrder.fromJson(Map<String, dynamic> json, {String baseUrl = ''}) {
    return CustomerOrder(
      id: json['id'] as String,
      businessId: json['businessId'] as String?,
      businessName: (json['businessName'] as String?) ?? 'محل',
      businessPhone: json['businessPhone'] as String?,
      lines: ((json['items'] as List?) ?? [])
          .map((i) => OrderLine.fromJson(i as Map<String, dynamic>, baseUrl: baseUrl))
          .toList(),
      total: (json['total'] as num?)?.toDouble() ?? 0,
      status: json['status'] == 'handled' ? OrderStatus.handled : OrderStatus.pending,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '')?.toLocal() ?? DateTime.now(),
    );
  }
}
