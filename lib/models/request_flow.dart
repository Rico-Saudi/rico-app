import 'dart:math';

import 'package:flutter/foundation.dart';

import 'business_catalog.dart';
import 'cart.dart';

enum RequestFlowStage { browsing, confirming, submitting, submitted }

/// حالة تدفّق "تصفّح منتجات محل ← سلّة ← تأكيد طلب" داخل رسالة دردشة واحدة.
///
/// كل ما يخصّ التدفّق يعيش هنا لا داخل الودجة: بطاقات المحادثة تُبنى داخل
/// [ListView.builder] الذي يتخلّص من عناصر خرجت عن الشاشة، فحالة محفوظة في
/// [State] قد تختفي حين يمرّر المستخدم لأعلى ويعود. حفظها في الرسالة نفسها
/// يبقيها ما بقيت المحادثة.
class RequestFlow {
  final BusinessCatalog catalog;
  final RequestFlowStage stage;

  /// سلّة هذا المحل — عدّة منتجات من نفس النشاط في طلب واحد.
  final Cart cart;

  /// الفئة المعروضة حالياً، وnull تعني الكل.
  final String? activeCategory;

  /// هل وُسّعت الشبكة لتعرض كل المنتجات؟ القائمة تبدأ مقتطعة كي لا تبتلع
  /// بطاقةُ محلٍّ بمئة منتج المحادثةَ كلها.
  final bool showAllProducts;

  final String? customerName;
  final String? customerPhone;
  final String? errorMessage;

  /// أصناف طلبها العميل وما لقيناها بقائمة المحل. التأكيد التلقائي ("…وأكّد
  /// الطلب") يتوقّف عندها: سلّة ناقصة يراجعها هو قبل ما توصل المحل.
  final List<String> missingItems;

  /// معرّف محاولة الإرسال لهذي السلّة بالذات. إعادة «أكّد» بعد مهلة ترسله
  /// نفسه، فلو كان الخادم حفظ الطلب الأول يرجعه بدل ما يسجّل طلب ثاني.
  /// يتجدد مع أي تعديل على السلّة: سلّة مختلفة طلب مختلف.
  final String clientRef;

  RequestFlow({
    required this.catalog,
    this.stage = RequestFlowStage.browsing,
    this.cart = const Cart(),
    this.activeCategory,
    this.showAllProducts = false,
    this.customerName,
    this.customerPhone,
    this.errorMessage,
    this.missingItems = const [],
    String? clientRef,
  }) : clientRef = clientRef ?? newClientRef();

  static final Random _random = Random.secure();

  /// ٣٢ خانة hex — يكفي ألا يتكرر لنفس العميل.
  static String newClientRef() =>
      List.generate(16, (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();

  /// المنتجات بعد تطبيق مرشِّح الفئة.
  List<CatalogProduct> get visibleProducts {
    if (activeCategory == null) return catalog.products;
    return catalog.products.where((p) => p.category == activeCategory).toList();
  }

  RequestFlow copyWith({
    RequestFlowStage? stage,
    Cart? cart,
    String? activeCategory,
    bool clearCategory = false,
    bool? showAllProducts,
    String? customerName,
    String? customerPhone,
    String? errorMessage,
    bool clearError = false,
  }) {
    return RequestFlow(
      catalog: catalog,
      stage: stage ?? this.stage,
      cart: cart ?? this.cart,
      activeCategory: clearCategory ? null : (activeCategory ?? this.activeCategory),
      showAllProducts: showAllProducts ?? this.showAllProducts,
      customerName: customerName ?? this.customerName,
      customerPhone: customerPhone ?? this.customerPhone,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      missingItems: missingItems,
      clientRef: cart == null || identical(cart, this.cart) ? clientRef : null,
    );
  }
}

/// أفعال بطاقة الطلب مجموعةً في كائن واحد بدل ثمانية ردود منفصلة تُمرَّر عبر
/// [ChatMessage] وتُنسخ يدوياً في كل [copyWith].
class CatalogFlowActions {
  final void Function(CatalogProduct product)? onAddProduct;
  final void Function(CatalogDeal deal)? onAddDeal;

  /// الكمية صفر تعني حذف السطر — انظر [Cart.setQuantity].
  final void Function(String itemType, String itemId, int quantity)? onSetQuantity;

  /// الانتقال من التصفّح لمراجعة السلّة.
  final VoidCallback? onReview;

  final void Function(String? category)? onSelectCategory;
  final VoidCallback? onToggleShowAll;

  /// تأكيد الطلب بحساب مسجّل — بلا وسائط: الاسم والرقم يأتيان من الحساب.
  final VoidCallback? onConfirm;

  /// يُطلب حين يضغط زائر زر التأكيد — يفتح ورقة الدخول.
  final VoidCallback? onRequestLogin;

  /// الرجوع من المراجعة إلى التصفّح.
  final VoidCallback? onBack;

  const CatalogFlowActions({
    this.onAddProduct,
    this.onAddDeal,
    this.onSetQuantity,
    this.onReview,
    this.onSelectCategory,
    this.onToggleShowAll,
    this.onConfirm,
    this.onRequestLogin,
    this.onBack,
  });
}
