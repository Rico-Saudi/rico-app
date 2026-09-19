import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/customer_order.dart';
import '../theme/app_theme.dart';
import '../utils/arabic_dates.dart';
import '../widgets/order_widgets.dart';
import '../widgets/rico_surfaces.dart';

/// تفاصيل طلب سابق — ما طُلب بالضبط، بكم، ومن أي محل، ومتى.
///
/// البيانات كلها من الطلب نفسه ولا تُجلب من جديد: هي لقطة وقت الإرسال، وهذا
/// المقصود — لو غيّر المحل سعره بعدها فسجلّ العميل يجب أن يظل يقول ما دفعه
/// يومها، لا ما صار السعر اليوم.
class OrderDetailsScreen extends StatelessWidget {
  final CustomerOrder order;

  const OrderDetailsScreen({super.key, required this.order});

  Future<void> _callShop() async {
    final phone = order.businessPhone;
    if (phone == null) return;
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'[\s()-]'), ''));
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
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
            if (order.businessPhone != null) ...[
              const SizedBox(height: 14),
              ElevatedButton.icon(
                onPressed: _callShop,
                icon: const Icon(Icons.phone_rounded, size: 18),
                label: const Text('اتصل بالمحل'),
              ),
            ],
          ],
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
    final handled = order.status == OrderStatus.handled;
    final tone = handled ? RicoColors.primaryDeep : RicoColors.goldInk;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: handled ? RicoColors.primaryTint : RicoColors.goldTint,
        borderRadius: RicoRadii.controlR,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(handled ? Icons.verified_rounded : Icons.hourglass_bottom_rounded, size: 17, color: tone),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              handled
                  ? 'المحل استلم طلبك وعلّمه كمتعامَل معه. لو ما وصلك اتصال، كلّمهم على الرقم تحت.'
                  : 'طلبك وصل المحل وينتظر ردّهم — يتواصلون معك على رقم حسابك.',
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
