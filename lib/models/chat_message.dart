import 'package:flutter/foundation.dart';
import '../services/intent_service.dart';
import 'deal.dart';
import 'place_result.dart';
import 'business_catalog.dart';
import 'place_section.dart';
import 'professional.dart';
import 'professional_flow.dart';
import 'request_flow.dart';

enum MessageSender { user, bot }

class ChatMessage {
  final String text;
  final MessageSender sender;
  final List<PlaceResult>? places;

  /// مقاطع نتائج مسمّاة حين تجمع الفقاعة أكثر من طلب مكان من نفس
  /// الرسالة ("أقرب مطعم وأرخص مطعم"). [places] يبقى مملوءاً بكل
  /// النتائج مسطّحة بلا تكرار — عليه تعتمد الإشارة لنتيجة سابقة
  /// ("الثاني") — و[placeSections] هو اللي يحدد شكل العرض.
  final List<PlaceSection>? placeSections;
  final List<Deal>? deals;
  final bool isLoading;
  final DateTime timestamp;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// النية المفهومة أثناء التحميل — تُستخدم لعرض بطاقة "فهمت طلبك" (وسوم)
  /// فوق فقاعة التحميل قبل وصول النتائج الفعلية، وبعد الاستبدال بالنتيجة
  /// الفعلية تُستخدم لاشتقاق سبب الترشيح الحقيقي في RecommendedPickCard.
  final QueryIntent? understandingIntent;

  /// يُستدعى عند الضغط على "اطلبه"/"عرض المنتجات والعروض" في نتيجة نشاط
  /// حقيقي من قاعدة ريكو (source == 'rico') — يبدأ تصفّح منتجاته وعروضه
  /// الفعلية عبر [requestFlow]. null لنتائج OSM الاحتياطية (لا يقابلها نشاط
  /// حقيقي بمنتجات فعلية).
  final void Function(PlaceResult place)? onOrder;

  /// يُستدعى عند الضغط على حبة اقتراح سريع (مثل "أبغى أرخص") أسفل نتائج
  /// البحث — يعيد تشغيل خط أنابيب التصنيف الفعلي بنص مكافئ، وليس فلترة
  /// وهمية على النتائج المعروضة.
  final void Function(String suggestion)? onQuickReply;

  /// اقتراحات «تقصد كذا؟» لأصناف طلبها المستخدم وما هي بقائمة المحل —
  /// تُعرض حبّات فوق بطاقة المحل، وضغط الحبّة يضيف الصنف المقترح للسلّة.
  final List<OrderSuggestion>? orderSuggestions;

  final void Function(OrderSuggestion suggestion)? onAddSuggestion;

  /// محلات معروضة ليختار منها العميل — حين ذكر أصنافاً بلا اسم محل. تُعرض
  /// بدل السلّة، لأنه لسه ما قرّر من وين يطلب.
  final List<OrderShopOption>? shopOptions;

  final void Function(OrderShopOption option)? onPickShop;

  /// المحل الجاري تجهيز الطلب منه بعد ضغطه.
  final String? busyShopId;

  /// تدفّق تصفّح منتجات/عروض نشاط حقيقي واحد ثم تأكيد طلب تواصل حقيقي
  /// (اهتمام بمنتج/عرض، يظهر لصاحب النشاط في لوحته) — بديل حقيقي لتدفّق
  /// الطلب التجريبي القديم الذي كان لا يتصل بأي خادم.
  final RequestFlow? requestFlow;

  /// أفعال بطاقة [requestFlow] — الإضافة للسلّة وتغيير الكميات والمراجعة
  /// والتأكيد، مجموعةً في كائن واحد بدل تسعة ردود تُنسخ يدوياً في [copyWith].
  final CatalogFlowActions? catalogActions;

  /// تدفّق "أقرب أصحاب مهنة + إرسال طلب تواصل لواحد منهم" — نظير
  /// [requestFlow] لنتائج الأشخاص بدل الأنشطة التجارية.
  final ProfessionalFlow? professionalFlow;

  /// يُستدعى عند اختيار صاحب مهنة من [professionalFlow] — ينقل الحالة من
  /// تصفّح إلى تأكيد.
  final void Function(Professional professional)? onSelectProfessional;

  /// يُستدعى عند تأكيد إرسال الطلب لصاحب المهنة المختار، ومعه وصف الشغلة
  /// إن كتبه العميل.
  final void Function(String? note)? onConfirmProfessionalRequest;

  /// يُستدعى حين يضغط زائر (غير مسجّل) زر الإرسال — يفتح ورقة الدخول ثم
  /// يكمل الإرسال تلقائياً، تماماً مثل [onRequestLogin].
  final VoidCallback? onProfessionalRequestLogin;

  /// يُستدعى عند الرجوع من التأكيد لقائمة أصحاب المهنة.
  final VoidCallback? onCancelProfessionalSelection;

  ChatMessage({
    required this.text,
    required this.sender,
    this.places,
    this.placeSections,
    this.deals,
    this.isLoading = false,
    this.actionLabel,
    this.onAction,
    this.understandingIntent,
    this.onOrder,
    this.onQuickReply,
    this.orderSuggestions,
    this.onAddSuggestion,
    this.shopOptions,
    this.onPickShop,
    this.busyShopId,
    this.requestFlow,
    this.catalogActions,
    this.professionalFlow,
    this.onSelectProfessional,
    this.onConfirmProfessionalRequest,
    this.onProfessionalRequestLogin,
    this.onCancelProfessionalSelection,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  ChatMessage copyWith({
    String? text,
    bool? isLoading,
    RequestFlow? requestFlow,
    ProfessionalFlow? professionalFlow,
    List<OrderSuggestion>? orderSuggestions,
    String? busyShopId,
    bool clearBusyShop = false,
  }) {
    return ChatMessage(
      text: text ?? this.text,
      sender: sender,
      places: places,
      placeSections: placeSections,
      deals: deals,
      isLoading: isLoading ?? this.isLoading,
      actionLabel: actionLabel,
      onAction: onAction,
      understandingIntent: understandingIntent,
      onOrder: onOrder,
      onQuickReply: onQuickReply,
      orderSuggestions: orderSuggestions ?? this.orderSuggestions,
      onAddSuggestion: onAddSuggestion,
      shopOptions: shopOptions,
      onPickShop: onPickShop,
      busyShopId: clearBusyShop ? null : (busyShopId ?? this.busyShopId),
      requestFlow: requestFlow ?? this.requestFlow,
      catalogActions: catalogActions,
      professionalFlow: professionalFlow ?? this.professionalFlow,
      onSelectProfessional: onSelectProfessional,
      onConfirmProfessionalRequest: onConfirmProfessionalRequest,
      onProfessionalRequestLogin: onProfessionalRequestLogin,
      onCancelProfessionalSelection: onCancelProfessionalSelection,
      timestamp: timestamp,
    );
  }
}
