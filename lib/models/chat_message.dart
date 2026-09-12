import 'package:flutter/foundation.dart';
import '../services/intent_service.dart';
import 'deal.dart';
import 'place_result.dart';
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

  /// يُستدعى عند اختيار عنصر (منتج أو عرض) من [requestFlow] — ينقل الحالة
  /// من تصفّح إلى تأكيد.
  final void Function(String itemType, String itemId, String label, String? detail)? onSelectCatalogItem;

  /// يُستدعى عند تأكيد الطلب — يرسل الطلب الفعلي للخادم باسم ورقم الحساب
  /// المسجّل، فلا يمرّر اسماً ورقماً: بعد ربط الطلبات بالحسابات صار مصدرهما
  /// الحساب الموثّق لا حقلين يُكتبان مع كل طلب.
  final VoidCallback? onConfirmRequest;

  /// يُستدعى حين يضغط زائر (غير مسجّل) زر التأكيد — يفتح ورقة الدخول، ثم
  /// يُرسل الطلب تلقائياً إذا نجح الدخول.
  final VoidCallback? onRequestLogin;

  /// يُستدعى عند الرجوع من مرحلة التأكيد إلى تصفّح القائمة من جديد.
  final VoidCallback? onCancelCatalogSelection;

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
    this.onSelectCatalogItem,
    this.onConfirmRequest,
    this.onRequestLogin,
    this.onCancelCatalogSelection,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  ChatMessage copyWith({
    String? text,
    bool? isLoading,
    RequestFlow? requestFlow,
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
      onSelectCatalogItem: onSelectCatalogItem,
      onConfirmRequest: onConfirmRequest,
      onRequestLogin: onRequestLogin,
      onCancelCatalogSelection: onCancelCatalogSelection,
      timestamp: timestamp,
    );
  }
}
