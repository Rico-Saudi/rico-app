/// عرض لقيناه على الإنترنت — من موقع خارج ريكو، فريكو ما يطلبه، يدلّ عليه
/// بس. الرابط والمصدر من نتيجة البحث نفسها، والباقي مقروء من نصّها.
class WebOffer {
  final String store;
  final String headline;
  final String? discount;
  final String? validUntil;
  final String url;

  /// نطاق الموقع ("panda.com.sa") — يقول للعميل وين بيفتح قبل ما يضغط.
  final String source;

  /// تاريخ النشر كما رجّعه Google ("قبل يومين").
  final String? date;

  const WebOffer({
    required this.store,
    required this.headline,
    required this.url,
    required this.source,
    this.discount,
    this.validUntil,
    this.date,
  });

  factory WebOffer.fromJson(Map<String, dynamic> json) => WebOffer(
        store: json['store'] as String? ?? '',
        headline: json['headline'] as String? ?? '',
        discount: json['discount'] as String?,
        validUntil: json['validUntil'] as String?,
        url: json['url'] as String,
        source: json['source'] as String? ?? '',
        date: json['date'] as String?,
      );
}

/// سعر صنف عند متجر أونلاين (Google Shopping).
class WebPrice {
  final String title;
  final String store;
  final double price;
  final String currency;
  final String url;
  final String? delivery;

  const WebPrice({
    required this.title,
    required this.store,
    required this.price,
    required this.currency,
    required this.url,
    this.delivery,
  });

  factory WebPrice.fromJson(Map<String, dynamic> json) => WebPrice(
        title: json['title'] as String? ?? '',
        store: json['store'] as String? ?? '',
        price: (json['price'] as num).toDouble(),
        currency: json['currency'] as String? ?? 'SAR',
        url: json['url'] as String,
        delivery: json['delivery'] as String?,
      );

  /// "ر.س" / "د.أ" — العملة كما يقراها العميل.
  String get currencyLabel => switch (currency) {
        'JOD' => 'د.أ',
        'USD' => r'$',
        _ => 'ر.س',
      };
}

/// أسعار صنف واحد أونلاين، الأرخص أولاً.
class WebPriceComparison {
  final String requested;
  final List<WebPrice> offers;

  const WebPriceComparison({required this.requested, required this.offers});

  factory WebPriceComparison.fromJson(Map<String, dynamic> json) => WebPriceComparison(
        requested: json['requested'] as String? ?? '',
        offers: ((json['offers'] as List?) ?? [])
            .map((o) => WebPrice.fromJson(o as Map<String, dynamic>))
            .where((o) => o.url.startsWith('http'))
            .toList(),
      );
}
