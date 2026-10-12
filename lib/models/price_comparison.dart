/// سعر صنف عند محل واحد — أرخص صف عنده هو فعلاً الصنف المطلوب (انظر
/// PublicService.comparePrices على الخادم).
class PriceOffer {
  final String businessId;
  final String businessName;
  final int? distanceMeters;
  final String productId;
  final String productName;

  /// وش يشتري السعر — "علبة"، "كيلو". null إذا ما حدّده المحل.
  final String? unit;
  final double price;

  /// السعر بعد الخصم — عليه تُرتّب المقارنة.
  final double finalPrice;
  final String? imageUrl;

  const PriceOffer({
    required this.businessId,
    required this.businessName,
    required this.productId,
    required this.productName,
    required this.price,
    required this.finalPrice,
    this.distanceMeters,
    this.unit,
    this.imageUrl,
  });

  factory PriceOffer.fromJson(Map<String, dynamic> json, {String baseUrl = ''}) {
    final imagePath = json['imageUrl'] as String?;
    return PriceOffer(
      businessId: json['businessId'] as String,
      businessName: json['businessName'] as String? ?? '',
      distanceMeters: (json['distanceMeters'] as num?)?.toInt(),
      productId: json['productId'] as String,
      productName: json['productName'] as String? ?? '',
      unit: json['unit'] as String?,
      price: (json['price'] as num).toDouble(),
      finalPrice: (json['finalPrice'] as num).toDouble(),
      imageUrl: imagePath == null ? null : '$baseUrl$imagePath',
    );
  }

  bool get hasDiscount => finalPrice < price;

  String? get distanceLabel {
    final meters = distanceMeters;
    if (meters == null) return null;
    return meters < 1000 ? '$meters م' : '${(meters / 1000).toStringAsFixed(1)} كم';
  }
}

/// مقارنة صنف واحد بين المحلات القريبة، الأرخص أولاً.
class PriceComparison {
  /// الصنف كما قاله العميل.
  final String requested;
  final List<PriceOffer> offers;

  const PriceComparison({required this.requested, required this.offers});

  factory PriceComparison.fromJson(Map<String, dynamic> json, {String baseUrl = ''}) => PriceComparison(
        requested: json['requested'] as String? ?? '',
        offers: ((json['offers'] as List?) ?? [])
            .map((o) => PriceOffer.fromJson(o as Map<String, dynamic>, baseUrl: baseUrl))
            .toList(),
      );

  /// كم يوفّر الأرخص عن أغلى محل بالقائمة — null إذا ما فيه فرق يُذكر.
  double? get savings {
    if (offers.length < 2) return null;
    final diff = offers.last.finalPrice - offers.first.finalPrice;
    return diff > 0 ? diff : null;
  }
}

/// تنسيق سعر: بلا كسور حين يكون صحيحاً، فـ«١٠ ر.س» أنظف من «١٠٫٠٠ ر.س».
String formatPrice(double value) {
  final rounded = value.roundToDouble();
  return value == rounded ? rounded.toStringAsFixed(0) : value.toStringAsFixed(2);
}
