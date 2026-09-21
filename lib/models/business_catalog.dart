/// منتج ضمن قائمة نشاط تجاري معيّن، كما يُرجعه GET /places/:id/catalog.
class CatalogProduct {
  final String id;
  final String name;
  final String? category;
  final double price;
  final double finalPrice;

  /// رابط صورة المنتج كاملاً — الخادم يرجع مساراً نسبياً ويُضاف إليه أصل
  /// الخدمة هنا، تماماً كما تفعل [PlaceResult] بصور الأماكن.
  final String? imageUrl;

  CatalogProduct({
    required this.id,
    required this.name,
    this.category,
    required this.price,
    required this.finalPrice,
    this.imageUrl,
  });

  factory CatalogProduct.fromJson(Map<String, dynamic> json, {String baseUrl = ''}) {
    final imagePath = json['imageUrl'] as String?;
    return CatalogProduct(
      id: json['id'] as String,
      name: json['name'] as String,
      category: json['category'] as String?,
      price: (json['price'] as num).toDouble(),
      finalPrice: (json['finalPrice'] as num).toDouble(),
      imageUrl: imagePath == null ? null : '$baseUrl$imagePath',
    );
  }

  bool get hasDiscount => finalPrice < price;
}

/// عرض ضمن قائمة نشاط تجاري معيّن (وليس عروض قريبة عامة كما في GET /deals).
class CatalogDeal {
  final String id;
  final String titleAr;
  final String? descriptionAr;
  final String dealType; // percent | fixed | bogo | free_item | bundle
  final double? value;
  final String? promoCode;

  CatalogDeal({
    required this.id,
    required this.titleAr,
    this.descriptionAr,
    required this.dealType,
    this.value,
    this.promoCode,
  });

  factory CatalogDeal.fromJson(Map<String, dynamic> json) {
    return CatalogDeal(
      id: json['id'] as String,
      titleAr: json['titleAr'] as String,
      descriptionAr: json['descriptionAr'] as String?,
      dealType: json['dealType'] as String,
      value: (json['value'] as num?)?.toDouble(),
      promoCode: json['promoCode'] as String?,
    );
  }

  /// نفس صياغة Deal.typeLabel — موحّدة عبر التطبيق.
  String get typeLabel {
    switch (dealType) {
      case 'percent':
        return value != null ? 'خصم ${value!.toStringAsFixed(0)}٪' : 'خصم';
      case 'fixed':
        return value != null ? 'خصم ${value!.toStringAsFixed(0)} ر.س' : 'خصم';
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
}

/// قائمة منتجات وعروض نشاط تجاري واحد — لعرضها داخل الدردشة عند اختيار
/// نتيجة بحث حقيقية من قاعدة ريكو (source == 'rico').
class BusinessCatalog {
  final String businessId;
  final String businessName;
  final List<CatalogProduct> products;
  final List<CatalogDeal> deals;

  BusinessCatalog({
    required this.businessId,
    required this.businessName,
    required this.products,
    required this.deals,
  });

  factory BusinessCatalog.fromJson(Map<String, dynamic> json, {String baseUrl = ''}) {
    return BusinessCatalog(
      businessId: json['businessId'] as String,
      businessName: json['businessName'] as String,
      products: (json['products'] as List? ?? [])
          .map((p) => CatalogProduct.fromJson(p as Map<String, dynamic>, baseUrl: baseUrl))
          .toList(),
      deals: (json['deals'] as List? ?? [])
          .map((d) => CatalogDeal.fromJson(d as Map<String, dynamic>))
          .toList(),
    );
  }

  bool get isEmpty => products.isEmpty && deals.isEmpty;

  /// فئات المنتجات بترتيب ظهورها — تُعرض كمرشِّحات فقط حين تتعدّد، فمحل
  /// بفئة واحدة لا يستحق صفّ مرشِّحات لا يفلتر شيئاً.
  List<String> get categories {
    final seen = <String>[];
    for (final product in products) {
      final category = product.category;
      if (category != null && category.isNotEmpty && !seen.contains(category)) {
        seen.add(category);
      }
    }
    return seen;
  }
}

/// نتيجة تحويل طلب منطوق ("بدي من مطعم الماهر كنافة وأرز بحليب") إلى سلّة —
/// كما يرجعها POST /orders/resolve.
///
/// [unmatched] أهم من [matched]: الصمت عن صنف ما لقيناه أسوأ من قوله، فالمحل
/// ما عنده كل شي والمستخدم لازم يعرف وش اللي سقط من طلبه.
class ResolvedOrder {
  final String? businessId;
  final String? businessName;
  final BusinessCatalog? catalog;
  final List<ResolvedOrderLine> matched;
  final List<String> unmatched;

  /// أصناف من [unmatched] لقى لها الخادم شيئاً قريباً بقائمة المحل. تُعرض
  /// **سؤالاً** لا جواباً: إضافتها للسلّة بضغطة من المستخدم، لا تلقائياً —
  /// «بودنغ أرز» تشبه «أرز بحليب» ما يعني إنها هي.
  final List<OrderSuggestion> suggestions;

  /// العميل اختار هذا المحل من قائمة اقترحناها عليه، ما سمّاه ابتداءً.
  final bool pickedFromOptions;

  /// المحلات المعروضة عليه حين ذكر أصنافاً بلا اسم محل — مرتّبة بمن عنده
  /// طلبه أولاً ثم بالأقرب. حين تكون غير فارغة، ما فيه سلّة ولا قائمة بعد:
  /// العميل لسه ما اختار من وين.
  final List<OrderShopOption> shopOptions;

  const ResolvedOrder({
    this.businessId,
    this.businessName,
    this.catalog,
    this.matched = const [],
    this.unmatched = const [],
    this.suggestions = const [],
    this.pickedFromOptions = false,
    this.shopOptions = const [],
  });

  /// ما اختار محلاً بعد — الرد عرضٌ لمحلات لا سلّة.
  bool get needsShopChoice => shopOptions.isNotEmpty;

  bool get foundBusiness => catalog != null;
  bool get foundNothing => matched.isEmpty;

  factory ResolvedOrder.fromJson(Map<String, dynamic> json, {String baseUrl = ''}) {
    final business = json['business'] as Map<String, dynamic>?;
    final catalog = json['catalog'] as Map<String, dynamic>?;
    return ResolvedOrder(
      businessId: business?['id'] as String?,
      businessName: business?['name'] as String?,
      catalog: catalog == null ? null : BusinessCatalog.fromJson(catalog, baseUrl: baseUrl),
      matched: ((json['matched'] as List?) ?? [])
          .map((m) => ResolvedOrderLine.fromJson(m as Map<String, dynamic>, baseUrl: baseUrl))
          .toList(),
      unmatched: ((json['unmatched'] as List?) ?? []).map((u) => u as String).toList(),
      suggestions: ((json['suggestions'] as List?) ?? [])
          .map((s) => OrderSuggestion.fromJson(s as Map<String, dynamic>))
          .toList(),
      pickedFromOptions: json['pickedFromOptions'] == true,
      shopOptions: ((json['shopOptions'] as List?) ?? [])
          .map((o) => OrderShopOption.fromJson(o as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// محل معروض على العميل ليطلب منه، حين ذكر أصنافاً بلا اسم محل.
///
/// يحمل معه **وش عنده من طلبك ووش ناقص**، لأن قائمة أسماء ومسافات وحدها
/// تخلّي العميل يفتح المحلات وحدة وحدة ليكتشف اللي نعرفه أصلاً.
class OrderShopOption {
  final String id;
  final String name;
  final int? distanceMeters;

  /// أصناف طلبها العميل وهذا المحل عنده منها.
  final List<String> has;

  /// أصناف طلبها وما هي عنده.
  final List<String> missing;

  const OrderShopOption({
    required this.id,
    required this.name,
    this.distanceMeters,
    this.has = const [],
    this.missing = const [],
  });

  factory OrderShopOption.fromJson(Map<String, dynamic> json) => OrderShopOption(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        distanceMeters: (json['distanceMeters'] as num?)?.toInt(),
        has: ((json['has'] as List?) ?? []).map((e) => e as String).toList(),
        missing: ((json['missing'] as List?) ?? []).map((e) => e as String).toList(),
      );

  bool get hasAll => missing.isEmpty && has.isNotEmpty;
  bool get hasNone => has.isEmpty;

  String? get distanceLabel {
    final meters = distanceMeters;
    if (meters == null) return null;
    return meters < 1000 ? '$meters م' : '${(meters / 1000).toStringAsFixed(1)} كم';
  }
}

/// «تقصد كذا؟» — أقرب صنف بقائمة المحل لصنف ما انطابق.
class OrderSuggestion {
  /// اسم الصنف كما نطقه المستخدم — يُعرض بالسؤال ليعرف أي طلب نقصد.
  final String requested;
  final String itemType;
  final String itemId;
  final String label;

  const OrderSuggestion({
    required this.requested,
    required this.itemType,
    required this.itemId,
    required this.label,
  });

  factory OrderSuggestion.fromJson(Map<String, dynamic> json) => OrderSuggestion(
        requested: json['requested'] as String? ?? '',
        itemType: json['itemType'] as String? ?? 'product',
        itemId: json['itemId'] as String? ?? '',
        label: json['label'] as String? ?? '',
      );
}

/// سطر طُوبق فعلاً بصنف في قائمة المحل.
class ResolvedOrderLine {
  final String itemType;
  final String itemId;
  final String label;
  final String? detail;
  final double? unitPrice;
  final String? imageUrl;
  final int quantity;

  /// سبب اختيار ريكو لهذا الصنف حين ما سمّاه العميل ("وجبة") — واحد من
  /// popular/deal/cheapest/pick، وnull للأصناف اللي طلبها بالاسم.
  ///
  /// الصنف اللي ما ذكره العميل لازم يجي معه سبب: سطر بسلّته ما يعرف من وين
  /// جا هو سطر لازم يراجعه بنفسه، والسبب هو اللي يخلّي الاختيار موثوقاً.
  final String? pickedBy;

  /// ما نطقه المستخدم قبل المطابقة — يُعرض حين يختلف عن [label]، فيعرف أن
  /// "كنافة" صارت "كنافة نابلسية" ولا يفاجأ.
  final String requestedAs;

  const ResolvedOrderLine({
    required this.itemType,
    required this.itemId,
    required this.label,
    this.detail,
    this.unitPrice,
    this.imageUrl,
    this.quantity = 1,
    this.requestedAs = '',
    this.pickedBy,
  });

  /// اختاره ريكو، ما طلبه العميل بالاسم.
  bool get wasPicked => pickedBy != null;

  /// سبب الاختيار كما يُقال للعميل — null حين ما فيه سبب يستاهل القول
  /// ("pick": أول صنف بالقائمة، وادّعاء سبب له كذب صغير بلا فايدة).
  String? get pickReason => switch (pickedBy) {
        'popular' => 'الأكثر طلباً عندهم',
        'deal' => 'وعليه خصم',
        'cheapest' => 'أوفر شي عندهم',
        _ => null,
      };

  factory ResolvedOrderLine.fromJson(Map<String, dynamic> json, {String baseUrl = ''}) {
    final imagePath = json['imageUrl'] as String?;
    return ResolvedOrderLine(
      itemType: json['itemType'] as String? ?? 'product',
      itemId: json['itemId'] as String? ?? '',
      label: json['label'] as String? ?? '',
      detail: json['detail'] as String?,
      unitPrice: (json['unitPrice'] as num?)?.toDouble(),
      imageUrl: imagePath == null ? null : '$baseUrl$imagePath',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      requestedAs: json['requestedAs'] as String? ?? '',
      pickedBy: json['pickedBy'] as String?,
    );
  }
}
