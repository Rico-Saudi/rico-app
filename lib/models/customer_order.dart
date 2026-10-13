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

/// من زاوية العميل: «بانتظار المحل»، «تواصل معك» (أكّد)، «جاهز» للاستلام،
/// «اكتمل»، أو «ملغي». الخادم يرسل `stage` بالتفصيل؛ النسخ الأقدم منه ترسل
/// `status` وحده (new/handled)، فيُقرأ هو عند غياب الأول.
enum OrderStatus { pending, handled, ready, completed, cancelled }

/// من ألغى الطلب: المحل، العميل نفسه، أو انتهت مهلة الرد بلا جواب.
enum CancelledBy { shop, customer, timeout }

CancelledBy? _cancelledByFrom(Object? raw) => switch (raw) {
      'shop' => CancelledBy.shop,
      'customer' => CancelledBy.customer,
      'timeout' => CancelledBy.timeout,
      _ => null,
    };

String? _nonBlank(String? text) {
  final trimmed = text?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

OrderStatus _statusFrom(Map<String, dynamic> json) {
  switch (json['stage']) {
    case 'new':
      return OrderStatus.pending;
    case 'confirmed':
      return OrderStatus.handled;
    case 'completed':
      return OrderStatus.completed;
    case 'ready':
      return OrderStatus.ready;
    case 'cancelled':
      return OrderStatus.cancelled;
  }
  return json['status'] == 'handled' ? OrderStatus.handled : OrderStatus.pending;
}

/// طلب سابق أرسله العميل لمحل واحد، كما يرجعه GET /requests/mine.
class CustomerOrder {
  final String id;
  final String? businessId;
  final String businessName;
  final String? businessPhone;
  final List<OrderLine> lines;
  final double total;
  final OrderStatus status;

  /// ما كتبه المحل للعميل — سبب الإلغاء غالباً.
  final String? vendorNote;
  final DateTime createdAt;

  /// للطلب الملغي فقط — null لغيره، وللطلبات الأقدم من الحقل.
  final CancelledBy? cancelledBy;

  /// تقييم العميل للطلب (١–٥)، وnull إذا ما قيّمه.
  final int? ratingStars;
  final String? ratingComment;

  const CustomerOrder({
    required this.id,
    this.businessId,
    required this.businessName,
    this.businessPhone,
    required this.lines,
    required this.total,
    required this.status,
    this.vendorNote,
    required this.createdAt,
    this.cancelledBy,
    this.ratingStars,
    this.ratingComment,
  });

  /// يُقيَّم بعد ما تعامل معه المحل — لا قبل ولا لطلب ملغي.
  bool get canRate => status == OrderStatus.handled || status == OrderStatus.ready || status == OrderStatus.completed;

  /// طلب ما انتهى بعد — المحل لسا ممكن يغيّر حالته، فيستاهل المتابعة.
  bool get isOpen => status == OrderStatus.pending || status == OrderStatus.handled || status == OrderStatus.ready;

  /// يلغيه العميل بنفسه ما دام المحل ما رد عليه؛ بعدها المحل يمكن بدأ يجهّزه
  /// والكلام يصير معه مباشرة (الخادم يرفض أصلاً).
  bool get canCancel => status == OrderStatus.pending;

  CustomerOrder copyWith({OrderStatus? status, CancelledBy? cancelledBy, int? ratingStars, String? ratingComment}) => CustomerOrder(
        id: id,
        businessId: businessId,
        businessName: businessName,
        businessPhone: businessPhone,
        lines: lines,
        total: total,
        status: status ?? this.status,
        vendorNote: vendorNote,
        createdAt: createdAt,
        cancelledBy: cancelledBy ?? this.cancelledBy,
        ratingStars: ratingStars ?? this.ratingStars,
        ratingComment: ratingComment ?? this.ratingComment,
      );

  /// نص يطلب نفس الأصناف من نفس المحل — يُرسل للمحادثة كأن العميل كتبه،
  /// فيمر بنفس طريق الطلب العادي (المحل والأصناف تُطابق من جديد على قائمته
  /// اليوم، لا على لقطة قديمة قد يكون بعضها ما عاد موجود).
  String get reorderText {
    final items = lines.where((l) => l.label.trim().isNotEmpty).map((l) => '${l.quantity} ${l.label}').join('، ');
    return items.isEmpty ? 'بدي أطلب من $businessName' : 'اطلب لي من $businessName $items';
  }

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
      status: _statusFrom(json),
      vendorNote: _nonBlank(json['vendorNote'] as String?),
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '')?.toLocal() ?? DateTime.now(),
      cancelledBy: _cancelledByFrom(json['cancelledBy']),
      ratingStars: ((json['rating'] as Map<String, dynamic>?)?['stars'] as num?)?.toInt(),
      ratingComment: _nonBlank((json['rating'] as Map<String, dynamic>?)?['comment'] as String?),
    );
  }
}
