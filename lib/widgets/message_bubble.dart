import 'package:flutter/material.dart';
import '../models/chat_message.dart';
import '../models/request_flow.dart';
import '../models/place_result.dart';
import '../models/place_section.dart';
import '../services/intent_service.dart';
import '../theme/app_theme.dart';
import 'catalog_flow_card.dart';
import 'order_shop_options_card.dart';
import 'chat_pill_chip.dart';
import 'place_result_card.dart';
import 'professional_flow_card.dart';
import 'recommended_pick_card.dart';
import 'rico_surfaces.dart';
import 'typing_dots.dart';
import 'understanding_card.dart';
import 'working_steps_card.dart';

/// صفّ رسالة واحد في المحادثة: الفقاعة النصية (بذيل عند جهة المتحدث) ثم أي
/// مرفقات — بطاقات نتائج، عروض، تدفّق طلب. الفقاعة محدودة العرض ليبقى سطر
/// النص مقروءاً، أما البطاقات فتأخذ عرضاً أكبر لأنها جداول بيانات لا كلام.
class MessageBubble extends StatelessWidget {
  final ChatMessage message;

  /// أول رسالة في مجموعة رسائل ريكو المتتالية — تُعرض بصورته وحدها، فلا
  /// تتكرر الأيقونة في كل سطر من ردٍّ واحد مقسّم.
  final bool showAvatar;

  /// يفتح تعديل هذي الرسالة. null لرسائل ريكو (ما تُعدّل) ولرسائل المستخدم
  /// أثناء انشغال ريكو بردٍّ جارٍ.
  final VoidCallback? onEdit;

  /// هذي هي الرسالة المفتوحة للتعديل الآن — تُعرض باهتة كي يربط المستخدم
  /// ما في حقل الكتابة بالفقاعة اللي جاي منها.
  final bool editing;

  const MessageBubble({
    super.key,
    required this.message,
    this.showAvatar = true,
    this.onEdit,
    this.editing = false,
  });

  static const double _avatarSize = 30;
  static const double _avatarGutter = _avatarSize + 8;

  @override
  Widget build(BuildContext context) {
    final isUser = message.sender == MessageSender.user;
    final width = MediaQuery.of(context).size.width;

    // أثناء التحميل مع نية مفهومة، بطاقتا "فهمت طلبك" و"ريكو يشتغل" تحملان
    // كل المعنى — فقاعة نصية إضافية فوقهما تكرار بلا فائدة.
    final skipBubble = message.isLoading && message.understandingIntent != null;
    final hasAttachments = (message.places?.isNotEmpty ?? false) ||
        (message.shopOptions?.isNotEmpty ?? false) ||
        // فقاعة مدموجة كل مقاطعها فاضية ما عندها places، ومع ذلك عندها وش
        // تعرض: سطر "ما لقيت" تحت عنوان كل مقطع.
        ((message.placeSections?.length ?? 0) > 1) ||
        (message.orderSuggestions?.isNotEmpty ?? false) ||
        (message.deals?.isNotEmpty ?? false) ||
        message.requestFlow != null ||
        message.professionalFlow != null ||
        message.understandingIntent != null && message.isLoading;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (!skipBubble)
            Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (!isUser)
                  SizedBox(
                    width: _avatarGutter,
                    child: showAvatar
                        ? const Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: RicoAvatar(size: _avatarSize),
                          )
                        : null,
                  ),
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: width * (isUser ? 0.8 : 0.78)),
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 180),
                    opacity: editing ? 0.45 : 1,
                    child: _Bubble(message: message, isUser: isUser),
                  ),
                ),
              ],
            ),

          // المرفقات تُزاح بمقدار عمود الصورة لتصطفّ مع الفقاعة فوقها.
          if (hasAttachments || message.actionLabel != null)
            Padding(
              padding: EdgeInsetsDirectional.only(start: isUser ? 0 : _avatarGutter, top: skipBubble ? 0 : 6),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: width * 0.9),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (message.understandingIntent != null && message.isLoading) ...[
                      UnderstandingCard(intent: message.understandingIntent!),
                      const SizedBox(height: 8),
                      WorkingStepsCard(
                        searchLabel: message.understandingIntent!.kind == IntentKind.deals
                            ? 'العروض'
                            : message.understandingIntent!.label,
                      ),
                    ],
                    if (message.actionLabel != null && message.onAction != null)
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: OutlinedButton(
                          onPressed: message.onAction,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: RicoColors.primary,
                            side: const BorderSide(color: RicoColors.primaryTintStrong),
                            minimumSize: const Size(0, 42),
                          ),
                          child: Text(message.actionLabel!),
                        ),
                      ),
                    // فقاعة تجمع أكثر من طلب مكان تُعرض مقاطع مسمّاة، لأن
                    // "أقرب مطعم" و"أرخص مطعم" بقائمة واحدة مسطّحة ما ينقرأ
                    // أيّهما جواب أيّ طلب.
                    if ((message.placeSections?.length ?? 0) > 1)
                      _PlaceSectionsResults(
                        sections: message.placeSections!,
                        onOrder: message.onOrder,
                        onQuickReply: message.onQuickReply,
                      )
                    else if (message.places != null && message.places!.isNotEmpty)
                      _PlacesResults(
                        places: message.places!,
                        intent: message.understandingIntent,
                        onOrder: message.onOrder,
                        onQuickReply: message.onQuickReply,
                      ),
                    if (message.deals != null && message.deals!.isNotEmpty)
                      for (final deal in message.deals!)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: DealResultCard(deal: deal),
                        ),
                    // فوق بطاقة المحل: الصنف اللي ما لقيناه ومعه أقرب شي
                    // عندهم، سؤالاً بحبّة تُضيفه — لا افتراضاً يضيفه بلا إذن.
                    if ((message.orderSuggestions?.isNotEmpty ?? false) && message.onAddSuggestion != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final suggestion in message.orderSuggestions!)
                              ChatPillChip(
                                label: 'أضف ${suggestion.label}',
                                icon: Icons.add_rounded,
                                onTap: () => message.onAddSuggestion!(suggestion),
                              ),
                          ],
                        ),
                      ),
                    if (message.shopOptions != null && message.shopOptions!.isNotEmpty)
                      OrderShopOptionsCard(
                        options: message.shopOptions!,
                        onPick: message.onPickShop,
                        busyShopId: message.busyShopId,
                      ),
                    if (message.requestFlow != null)
                      CatalogFlowCard(
                        flow: message.requestFlow!,
                        actions: message.catalogActions ?? const CatalogFlowActions(),
                      ),
                    if (message.professionalFlow != null)
                      ProfessionalFlowCard(
                        flow: message.professionalFlow!,
                        onSelect: message.onSelectProfessional,
                        onConfirm: message.onConfirmProfessionalRequest,
                        onRequestLogin: message.onProfessionalRequestLogin,
                        onCancel: message.onCancelProfessionalSelection,
                      ),
                  ],
                ),
              ),
            ),

          if (!message.isLoading && message.text.isNotEmpty)
            Padding(
              padding: EdgeInsetsDirectional.only(start: isUser ? 0 : _avatarGutter, top: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // زر ظاهر لا ضغطة مطوّلة مخفيّة: التعديل ما ينفع يكون
                  // إيماءة يكتشفها المستخدم بالصدفة.
                  if (onEdit != null) ...[
                    _EditAction(onTap: onEdit!),
                    Text(' · ', style: RicoText.caption.copyWith(color: RicoColors.inkFaint, fontSize: 10.5)),
                  ],
                  Text(
                    _formatTime(message.timestamp),
                    style: RicoText.caption.copyWith(color: RicoColors.inkFaint, fontSize: 10.5),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// وقت بصيغة ١٢ ساعة بلاحقة عربية (ص/م) — أقرب لقراءة المستخدم السعودي من
  /// AM/PM اللاتينية، وبلا تهيئة locale.
  static String _formatTime(DateTime t) {
    final hour12 = t.hour % 12 == 0 ? 12 : t.hour % 12;
    final minute = t.minute.toString().padLeft(2, '0');
    return '$hour12:$minute ${t.hour < 12 ? 'ص' : 'م'}';
  }
}

/// «تعديل» بجانب وقت رسالة المستخدم — بحجم الوقت نفسه فما يزاحم النص، وبلون
/// العلامة فيُقرأ كفعل لا كسطر معلومات.
class _EditAction extends StatelessWidget {
  final VoidCallback onTap;

  const _EditAction({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'تعديل الرسالة',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.edit_rounded, size: 11, color: RicoColors.primary),
              const SizedBox(width: 3),
              Text(
                'تعديل',
                style: RicoText.caption.copyWith(
                  color: RicoColors.primary,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final ChatMessage message;
  final bool isUser;

  const _Bubble({required this.message, required this.isUser});

  @override
  Widget build(BuildContext context) {
    final radius = RicoRadii.bubbleFor(isUser: isUser);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
      decoration: BoxDecoration(
        // فقاعة المستخدم بتدرّج أخضر (هوية العلامة)، وفقاعة ريكو سطح أبيض
        // بحافة شعرية — تبادل واضح بين "كلامي" و"كلامه" بلا ألوان صارخة.
        gradient: isUser
            ? const LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: [RicoColors.primaryLift, RicoColors.primaryDeep],
              )
            : null,
        color: isUser ? null : RicoColors.surface,
        borderRadius: radius,
        border: isUser ? null : Border.all(color: RicoColors.hairline),
        boxShadow: isUser ? RicoShadows.brand : RicoShadows.subtle,
      ),
      child: message.isLoading
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const TypingDots(),
                if (message.text.isNotEmpty) ...[
                  const SizedBox(width: 10),
                  Flexible(
                    child: Text(message.text, style: RicoText.label.copyWith(color: RicoColors.inkMuted)),
                  ),
                ],
              ],
            )
          : Text(
              message.text,
              style: isUser
                  ? RicoText.body.copyWith(color: Colors.white, fontWeight: FontWeight.w500)
                  : RicoText.body,
            ),
    );
  }
}

class _PlacesResults extends StatelessWidget {
  final List<PlaceResult> places;
  final QueryIntent? intent;
  final void Function(PlaceResult place)? onOrder;
  final void Function(String suggestion)? onQuickReply;

  const _PlacesResults({
    required this.places,
    required this.intent,
    required this.onOrder,
    required this.onQuickReply,
  });

  @override
  Widget build(BuildContext context) {
    final first = places.first;
    final rest = places.skip(1).toList();
    final resolvedIntent = intent;
    final resolvedOnOrder = onOrder;
    final resolvedOnQuickReply = onQuickReply;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // بطاقة "ترشيح ريكو" وزر تصفّح المنتجات/العروض لا تظهر إلا لنشاط
        // حقيقي من قاعدتنا (source == 'rico') — نتيجة الاحتياط الخارجية لا
        // يقابلها نشاط تجاري فعلي بمنتجات حقيقية لعرضها.
        if (resolvedIntent != null && resolvedOnOrder != null && first.source == 'rico')
          RecommendedPickCard(place: first, intent: resolvedIntent, onOrder: () => resolvedOnOrder(first))
        else
          PlaceResultCard(
            place: first,
            rank: 1,
            onViewCatalog: first.source == 'rico' && resolvedOnOrder != null ? () => resolvedOnOrder(first) : null,
          ),
        if (rest.isNotEmpty) ...[
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: RicoSectionLabel(label: 'خيارات ثانية (${rest.length})'),
          ),
          for (var i = 0; i < rest.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: PlaceResultCard(
                place: rest[i],
                rank: i + 2,
                onViewCatalog:
                    rest[i].source == 'rico' && resolvedOnOrder != null ? () => resolvedOnOrder(rest[i]) : null,
              ),
            ),
        ],
        if (resolvedOnQuickReply != null) ...[
          const SizedBox(height: 4),
          _QuickReplyChips(onQuickReply: resolvedOnQuickReply),
        ],
      ],
    );
  }
}

/// نتائج فقاعة واحدة مقسّمة لمقاطع مسمّاة — مقطع لكل طلب مكان بالرسالة.
///
/// كل مقطع يعرض ترشيحه الأول ثم خياراته الثانية، تماماً مثل [_PlacesResults]،
/// لكن حبّات الاقتراح السريع تطلع مرة وحدة بآخر الفقاعة لا تحت كل مقطع.
class _PlaceSectionsResults extends StatelessWidget {
  final List<PlaceSection> sections;
  final void Function(PlaceResult place)? onOrder;
  final void Function(String suggestion)? onQuickReply;

  const _PlaceSectionsResults({
    required this.sections,
    required this.onOrder,
    required this.onQuickReply,
  });

  @override
  Widget build(BuildContext context) {
    final resolvedOnQuickReply = onQuickReply;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var s = 0; s < sections.length; s++) ...[
          if (s > 0) const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: RicoSectionLabel(label: sections[s].title),
          ),
          ..._sectionBody(sections[s]),
        ],
        if (resolvedOnQuickReply != null) ...[
          const SizedBox(height: 12),
          _QuickReplyChips(onQuickReply: resolvedOnQuickReply),
        ],
      ],
    );
  }

  List<Widget> _sectionBody(PlaceSection section) {
    if (section.isEmpty) {
      return [
        Text(
          section.emptyNote ?? 'ما لقيت ${section.intent.label} قريب منك الحين 😕',
          style: const TextStyle(color: RicoColors.inkMuted, height: 1.5),
        ),
      ];
    }

    final first = section.places.first;
    final rest = section.places.skip(1).toList();
    final resolvedOnOrder = onOrder;
    return [
      if (resolvedOnOrder != null && first.source == 'rico')
        RecommendedPickCard(place: first, intent: section.intent, onOrder: () => resolvedOnOrder(first))
      else
        PlaceResultCard(
          place: first,
          rank: 1,
          onViewCatalog: first.source == 'rico' && resolvedOnOrder != null ? () => resolvedOnOrder(first) : null,
        ),
      if (rest.isNotEmpty) ...[
        const SizedBox(height: 10),
        for (var i = 0; i < rest.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: PlaceResultCard(
              place: rest[i],
              rank: i + 2,
              onViewCatalog:
                  rest[i].source == 'rico' && resolvedOnOrder != null ? () => resolvedOnOrder(rest[i]) : null,
            ),
          ),
      ],
    ];
  }
}

class _QuickReplyChips extends StatelessWidget {
  final void Function(String suggestion) onQuickReply;

  const _QuickReplyChips({required this.onQuickReply});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ChatPillChip(
          label: 'أبغى أرخص',
          icon: Icons.savings_rounded,
          onTap: () => onQuickReply('أبغى أرخص'),
        ),
        ChatPillChip(
          label: 'الأقرب لي',
          icon: Icons.near_me_rounded,
          onTap: () => onQuickReply('أبغى الأقرب'),
        ),
        ChatPillChip(
          label: 'ورّني غيرها',
          icon: Icons.refresh_rounded,
          onTap: () => onQuickReply('ورّني خيارات ثانية'),
        ),
      ],
    );
  }
}
