import 'currency.dart';

/// خصم/عرض على مكان معيّن، كما يُرجعه رأس النهاية GET /deals في rico-api.
class Deal {
  final String id;
  final String placeId;
  final String placeName;
  final String titleAr;
  final String? descriptionAr;
  final String dealType; // percent | fixed | bogo | free_item | bundle
  final double? value;
  final String currency;
  final String? promoCode;
  final double? distanceMeters;
  final String source;
  final String? sourceRef;

  Deal({
    required this.id,
    required this.placeId,
    required this.placeName,
    required this.titleAr,
    this.descriptionAr,
    required this.dealType,
    this.value,
    this.currency = kDefaultCurrency,
    this.promoCode,
    this.distanceMeters,
    required this.source,
    this.sourceRef,
  });

  factory Deal.fromJson(Map<String, dynamic> json) {
    return Deal(
      id: json['id'] as String,
      placeId: json['placeId'] as String,
      placeName: json['placeName'] as String,
      titleAr: json['titleAr'] as String,
      descriptionAr: json['descriptionAr'] as String?,
      dealType: json['dealType'] as String,
      value: (json['value'] as num?)?.toDouble(),
      currency: json['currency'] as String? ?? kDefaultCurrency,
      promoCode: json['promoCode'] as String?,
      distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
      source: json['source'] as String,
      sourceRef: json['sourceRef'] as String?,
    );
  }

  /// وصف مختصر لنوع العرض يُستخدم كبديل إذا لم يوجد عنوان مخصص كافٍ.
  String get typeLabel {
    switch (dealType) {
      case 'percent':
        return value != null ? 'خصم ${value!.toStringAsFixed(0)}٪' : 'خصم';
      case 'fixed':
        return value != null ? 'خصم ${formatPrice(value!, currency)}' : 'خصم';
      case 'bogo':
        return 'اشتري واحد واحصل على الثاني مجاناً';
      case 'free_item':
        return 'عنصر مجاني';
      case 'bundle':
        return 'عرض باقة';
      default:
        return 'عرض';
    }
  }

  String get distanceLabel {
    if (distanceMeters == null) return '';
    if (distanceMeters! < 1000) return '${distanceMeters!.round()} م';
    return '${(distanceMeters! / 1000).toStringAsFixed(1)} كم';
  }
}
