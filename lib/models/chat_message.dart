import 'package:flutter/foundation.dart';
import '../services/intent_service.dart';
import 'deal.dart';
import 'place_result.dart';
import 'professional.dart';
import 'professional_flow.dart';
import 'request_flow.dart';

enum MessageSender { user, bot }

class ChatMessage {
  final String text;
  final MessageSender sender;
  final List<PlaceResult>? places;
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
    this.deals,
    this.isLoading = false,
    this.actionLabel,
    this.onAction,
    this.understandingIntent,
    this.onOrder,
    this.onQuickReply,
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
  }) {
    return ChatMessage(
      text: text ?? this.text,
      sender: sender,
      places: places,
      deals: deals,
      isLoading: isLoading ?? this.isLoading,
      actionLabel: actionLabel,
      onAction: onAction,
      understandingIntent: understandingIntent,
      onOrder: onOrder,
      onQuickReply: onQuickReply,
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
