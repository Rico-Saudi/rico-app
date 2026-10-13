import 'package:flutter/material.dart';

import '../models/customer_order.dart';
import '../services/auth_store.dart';
import '../services/chat_inbox.dart';
import '../services/request_service.dart';
import '../theme/app_theme.dart';
import '../utils/arabic_dates.dart';
import '../utils/dialer.dart';
import '../widgets/order_widgets.dart';
import '../widgets/rico_surfaces.dart';

/// تفاصيل طلب سابق — ما طُلب بالضبط، بكم، ومن أي محل، ومتى.
///
/// البيانات كلها من الطلب نفسه ولا تُجلب من جديد: هي لقطة وقت الإرسال، وهذا
/// المقصود — لو غيّر المحل سعره بعدها فسجلّ العميل يجب أن يظل يقول ما دفعه
/// يومها، لا ما صار السعر اليوم.
class OrderDetailsScreen extends StatefulWidget {
  final CustomerOrder order;

  const OrderDetailsScreen({super.key, required this.order});

  @override
  State<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends State<OrderDetailsScreen> {
  final RequestService _service = RequestService();
  late CustomerOrder _order = widget.order;
  bool _cancelling = false;

  @override
  void didUpdateWidget(OrderDetailsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.order, widget.order)) _order = widget.order;
  }

  Future<void> _callShop() async {
    final phone = _order.businessPhone;
    if (phone == null) return;
    await openDialer(phone);
  }

  Future<void> _cancel() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('تلغي الطلب؟'),
        content: Text('بنبلّغ ${_order.businessName} إنك ألغيت الطلب.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('لا، خلّه')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: RicoColors.danger),
            child: const Text('إيه، ألغه'),
          ),
        ],
      ),
    );
    if (sure != true || !mounted) return;

    final token = AuthStore.instance.token;
    if (token == null) {
      _toast('انتهت جلستك، سجّل دخولك من جديد.');
      return;
    }
    setState(() => _cancelling = true);
    try {
      await _service.cancelOrder(token: token, orderId: _order.id);
      if (!mounted) return;
      setState(() => _order = _order.copyWith(status: OrderStatus.cancelled, cancelledBy: CancelledBy.customer));
    } on RequestException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  Future<void> _rate(int stars, String? comment) async {
    final token = AuthStore.instance.token;
    if (token == null) {
      _toast('انتهت جلستك، سجّل دخولك من جديد.');
      return;
    }
    try {
      await _service.rateOrder(token: token, orderId: _order.id, stars: stars, comment: comment);
      if (!mounted) return;
      setState(() => _order = _order.copyWith(ratingStars: stars, ratingComment: comment));
      _toast('شكراً! تقييمك يساعد غيرك يختار 🌟');
    } on RequestException catch (e) {
      _toast(e.message);
    }
  }

  /// يرجع للمحادثة ويطلب نفس الأصناف من نفس المحل — تمر بنفس طريق الطلب
  /// العادي، فالمحل يطابقها على قائمته اليوم ويقول وش اللي ما عاد موجود.
  void _reorder() {
    ChatInbox.send(_order.reorderText);
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    return PopScope(
      // الشاشة اللي قبلها (طلباتي) تحدّث الحالة لو تغيّرت هنا.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(order);
      },
      child: Scaffold(
        backgroundColor: RicoColors.canvas,
        appBar: AppBar(
          title: const Text('تفاصيل الطلب'),
          backgroundColor: RicoColors.canvas,
          surfaceTintColor: Colors.transparent,
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 24),
            children: [
              _ShopHeader(order: order),
              const SizedBox(height: 10),
              _StatusExplainer(order: order),
              const SizedBox(height: 10),
              RicoCard(
                padding: const EdgeInsets.fromLTRB(13, 13, 13, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const RicoSectionLabel(label: 'الأصناف', icon: Icons.shopping_bag_rounded),
                    const SizedBox(height: 4),
                    for (final line in order.lines) _LineRow(line: line),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              _TotalCard(order: order),
              if (order.canRate) ...[
                const SizedBox(height: 10),
                _RatingCard(
                  stars: order.ratingStars,
                  onRate: _rate,
                ),
              ],
              if (order.businessPhone != null) ...[
                const SizedBox(height: 14),
                ElevatedButton.icon(
                  onPressed: _callShop,
                  icon: const Icon(Icons.phone_rounded, size: 18),
                  label: const Text('اتصل بالمحل'),
                ),
              ],
              if (!order.isOpen) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: _reorder,
                  icon: const Icon(Icons.replay_rounded, size: 18),
                  label: const Text('اطلب نفسه مرة ثانية'),
                ),
              ],
              if (order.canCancel) ...[
                const SizedBox(height: 10),
                TextButton.icon(
                  onPressed: _cancelling ? null : _cancel,
                  style: TextButton.styleFrom(foregroundColor: RicoColors.danger),
                  icon: _cancelling
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.close_rounded, size: 18),
                  label: const Text('ألغِ الطلب'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ShopHeader extends StatelessWidget {
  final CustomerOrder order;

  const _ShopHeader({required this.order});

  @override
  Widget build(BuildContext context) {
    return RicoCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: const BoxDecoration(color: RicoColors.primaryTint, shape: BoxShape.circle),
                child: const Icon(Icons.storefront_rounded, size: 20, color: RicoColors.primary),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(order.businessName, style: RicoText.cardTitle, maxLines: 2),
                    const SizedBox(height: 3),
                    Text(
                      '${ArabicDates.date(order.createdAt)}  ·  ${ArabicDates.time(order.createdAt)}',
                      style: RicoText.caption.copyWith(color: RicoColors.inkFaint),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 11),
            child: Divider(height: 1),
          ),
          Row(
            children: [
              Text('رقم الطلب', style: RicoText.caption.copyWith(color: RicoColors.inkMuted)),
              const SizedBox(width: 8),
              // المرجع يُقرأ للمحل في المكالمة، فيُكتب من اليسار كالأرقام.
              Text(
                '#${order.reference}',
                textDirection: TextDirection.ltr,
                style: RicoText.labelStrong.copyWith(letterSpacing: 0.5),
              ),
              const Spacer(),
              OrderStatusChip(status: order.status, large: true),
            ],
          ),
        ],
      ),
    );
  }
}

/// شرح الحالة بجملة بدل وسم وحده: «بانتظار المحل» لا تقول للعميل هل يتصل هو
/// أم ينتظر، والجملة تقولها.
class _StatusExplainer extends StatelessWidget {
  final CustomerOrder order;

  const _StatusExplainer({required this.order});

  @override
  Widget build(BuildContext context) {
    final note = order.vendorNote;
    final (tone, background, icon, text) = switch (order.status) {
      OrderStatus.pending => (
          RicoColors.goldInk,
          RicoColors.goldTint,
          Icons.hourglass_bottom_rounded,
          'طلبك وصل المحل وينتظر ردّهم — يتواصلون معك على رقم حسابك.',
        ),
      OrderStatus.handled => (
          RicoColors.primaryDeep,
          RicoColors.primaryTint,
          Icons.verified_rounded,
          'المحل استلم طلبك وعلّمه كمتعامَل معه. لو ما وصلك اتصال، كلّمهم على الرقم تحت.',
        ),
      OrderStatus.ready => (
          RicoColors.primaryDeep,
          RicoColors.primaryTint,
          Icons.shopping_bag_rounded,
          'طلبك جاهز عند المحل. لو تحتاج تتأكد من شي، كلّمهم على الرقم تحت.',
        ),
      OrderStatus.completed => (
          RicoColors.inkMuted,
          RicoColors.surfaceSunken,
          Icons.task_alt_rounded,
          'اكتمل الطلب. بالعافية! تقدر تطلب نفسه مرة ثانية من الزر تحت.',
        ),
      OrderStatus.cancelled => (
          RicoColors.danger,
          RicoColors.dangerTint,
          Icons.cancel_rounded,
          switch (order.cancelledBy) {
            CancelledBy.customer => 'ألغيت هذا الطلب قبل ما يرد المحل.',
            CancelledBy.timeout => 'المحل ما رد على طلبك بالوقت، فلغيناه عشان ما تنتظر. جرّب محل ثاني أو اطلب نفسه مرة ثانية.',
            _ => note != null
                ? 'المحل ألغى الطلب: $note'
                : 'المحل ألغى الطلب. تقدر تكلّمهم على الرقم تحت أو تطلب من محل ثاني.',
          },
        ),
    };
    // A note on any other stage ("جاهز بعد ساعة") is added under the sentence.
    final shownNote = order.status != OrderStatus.cancelled && note != null ? '\n$note' : '';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: RicoRadii.controlR,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: tone),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              '$text$shownNote',
              style: RicoText.caption.copyWith(color: tone, height: 1.65),
            ),
          ),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  final OrderLine line;

  const _LineRow({required this.line});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OrderLineImage(line: line, size: 48),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.label,
                  style: RicoText.label.copyWith(fontWeight: FontWeight.w600, color: RicoColors.ink, height: 1.4),
                ),
                const SizedBox(height: 3),
                Text(
                  // سعر الوحدة × الكمية مكتوبة صراحة: العميل يراجع الحساب هنا،
                  // فالمجموع وحده لا يكفيه ليتأكد.
                  line.unitPrice == null
                      ? (line.detail ?? 'عرض')
                      : '${money(line.unitPrice!)} ر.س × ${line.quantity}',
                  style: RicoText.caption.copyWith(color: RicoColors.inkMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: const BoxDecoration(color: RicoColors.surfaceSunken, borderRadius: RicoRadii.pillR),
                child: Text('×${line.quantity}', style: RicoText.caption.copyWith(fontWeight: FontWeight.w700)),
              ),
              if (line.unitPrice != null) ...[
                const SizedBox(height: 5),
                Text(
                  '${money(line.lineTotal)} ر.س',
                  style: RicoText.labelStrong.copyWith(color: RicoColors.primaryDeep),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _TotalCard extends StatelessWidget {
  final CustomerOrder order;

  const _TotalCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return RicoCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${order.itemCount} ${piecesLabel(order.itemCount)}',
                  style: RicoText.caption.copyWith(color: RicoColors.inkMuted),
                ),
              ),
              const Text('الإجمالي', style: RicoText.labelStrong),
              const SizedBox(width: 10),
              Text(
                '${money(order.total)} ر.س',
                style: RicoText.title.copyWith(fontSize: 18, color: RicoColors.primaryDeep),
              ),
            ],
          ),
          if (order.hasUnpricedLine)
            const Padding(
              padding: EdgeInsets.only(top: 9),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, size: 13, color: RicoColors.inkMuted),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text('قيمة العروض يحسبها المحل عند التواصل.', style: RicoText.caption),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// خمس نجوم يقيّم فيها العميل طلبه، وتعليق اختياري. التقييم يتجمّع على المحل
/// ويرتّب محلات ريكو بـ«الأعلى تقييماً».
class _RatingCard extends StatefulWidget {
  final int? stars;
  final Future<void> Function(int stars, String? comment) onRate;

  const _RatingCard({required this.stars, required this.onRate});

  @override
  State<_RatingCard> createState() => _RatingCardState();
}

class _RatingCardState extends State<_RatingCard> {
  late int _stars = widget.stars ?? 0;
  final TextEditingController _comment = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_stars == 0 || _sending) return;
    setState(() => _sending = true);
    await widget.onRate(_stars, _comment.text);
    if (mounted) setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final rated = widget.stars != null;
    return RicoCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RicoSectionLabel(label: rated ? 'تقييمك' : 'كيف كان طلبك؟', icon: Icons.star_rounded),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  tooltip: '$i من 5',
                  onPressed: _sending ? null : () => setState(() => _stars = i),
                  icon: Icon(
                    i <= _stars ? Icons.star_rounded : Icons.star_outline_rounded,
                    size: 32,
                    color: i <= _stars ? RicoColors.goldInk : RicoColors.inkFaint,
                  ),
                ),
            ],
          ),
          if (_stars > 0 && _stars != widget.stars) ...[
            const SizedBox(height: 6),
            TextField(
              controller: _comment,
              maxLength: 300,
              decoration: const InputDecoration(hintText: 'كلمة للمحل (اختياري)', counterText: ''),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _sending ? null : _submit,
              child: Text(_sending ? 'يرسل…' : 'أرسل التقييم'),
            ),
          ],
        ],
      ),
    );
  }
}
