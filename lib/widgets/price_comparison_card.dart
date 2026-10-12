import 'package:flutter/material.dart';
import '../models/price_comparison.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';

/// "وين أرخص جبنة؟" — المحلات القريبة اللي تبيع الصنف، الأرخص أولاً.
///
/// كل سطر يقول **وش الصنف بالضبط** عند هذا المحل (الاسم والوحدة) لا السعر
/// وحده: "جبنة" عند محل مثلثات بـ٧ وعند ثاني شيدر كيلو بـ٢٠، وسعر بلا اسم
/// يخلّي المقارنة تبان أوضح مما هي. وزر «اطلبه» يحوّل الجواب لطلب بضغطة.
class PriceComparisonCard extends StatelessWidget {
  final List<PriceComparison> comparisons;

  /// ضغط «اطلبه» — null أثناء انشغال ريكو بتجهيز طلب سابق.
  final void Function(PriceOffer offer)? onOrder;

  /// العرض الجاري تجهيز طلبه الآن (انظر [offerKey]).
  final String? busyKey;

  const PriceComparisonCard({super.key, required this.comparisons, this.onOrder, this.busyKey});

  /// مفتاح عرض بعينه: نفس المحل قد يطلع بمقارنتين (جبنة وحليب).
  static String offerKey(PriceOffer offer) => '${offer.businessId}:${offer.productId}';

  @override
  Widget build(BuildContext context) {
    final titled = comparisons.length > 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < comparisons.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _ComparisonBlock(
            comparison: comparisons[i],
            titled: titled,
            onOrder: busyKey != null || onOrder == null ? null : onOrder,
            busyKey: busyKey,
          ),
        ],
      ],
    );
  }
}

class _ComparisonBlock extends StatelessWidget {
  final PriceComparison comparison;
  final bool titled;
  final void Function(PriceOffer offer)? onOrder;
  final String? busyKey;

  const _ComparisonBlock({required this.comparison, required this.titled, this.onOrder, this.busyKey});

  @override
  Widget build(BuildContext context) {
    final offers = comparison.offers;
    final savings = comparison.savings;

    return RicoCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: const BoxDecoration(
              color: RicoColors.surfaceSunken,
              border: Border(bottom: BorderSide(color: RicoColors.hairline)),
            ),
            child: Row(
              children: [
                const Icon(Icons.compare_arrows_rounded, size: 16, color: RicoColors.inkMuted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    titled || offers.isEmpty ? comparison.requested : 'أسعار ${comparison.requested} حولك',
                    style: RicoText.labelStrong,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (offers.length > 1)
                  Text('${offers.length} محلات', style: RicoText.caption.copyWith(color: RicoColors.inkMuted)),
              ],
            ),
          ),
          if (offers.isEmpty)
            Padding(
              padding: const EdgeInsets.all(14),
              child: Text(
                'ما لقيت ${comparison.requested} عند المحلات القريبة منك 😕',
                style: RicoText.body.copyWith(color: RicoColors.inkMuted),
              ),
            )
          else
            for (var i = 0; i < offers.length; i++) ...[
              if (i > 0) const Divider(height: 1, thickness: 1, color: RicoColors.hairline),
              _OfferRow(
                offer: offers[i],
                cheapest: i == 0 && offers.length > 1,
                onOrder: onOrder == null ? null : () => onOrder!(offers[i]),
                busy: busyKey == PriceComparisonCard.offerKey(offers[i]),
              ),
            ],
          if (savings != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: const BoxDecoration(
                color: RicoColors.primaryTint,
                border: Border(top: BorderSide(color: RicoColors.hairline)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.savings_rounded, size: 15, color: RicoColors.primary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'من ${offers.first.businessName} توفّر ${formatPrice(savings)} ر.س عن الأغلى',
                      style: RicoText.caption.copyWith(color: RicoColors.primaryDeep),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _OfferRow extends StatelessWidget {
  final PriceOffer offer;
  final bool cheapest;
  final VoidCallback? onOrder;
  final bool busy;

  const _OfferRow({required this.offer, required this.cheapest, required this.onOrder, required this.busy});

  @override
  Widget build(BuildContext context) {
    final distance = offer.distanceLabel;
    final unit = offer.unit;

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        offer.businessName,
                        style: RicoText.labelStrong,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (cheapest) ...[
                      const SizedBox(width: 6),
                      const MetaChip(icon: Icons.verified_rounded, label: 'الأرخص', tone: RicoColors.primary),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  unit == null ? offer.productName : '${offer.productName} · $unit',
                  style: RicoText.caption.copyWith(color: RicoColors.inkBody),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (distance != null) ...[
                  const SizedBox(height: 5),
                  MetaChip(icon: Icons.near_me_rounded, label: distance, filled: false),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${formatPrice(offer.finalPrice)} ر.س',
                style: RicoText.cardTitle.copyWith(color: cheapest ? RicoColors.primaryDeep : RicoColors.ink),
              ),
              if (offer.hasDiscount)
                Text(
                  '${formatPrice(offer.price)} ر.س',
                  style: RicoText.caption.copyWith(
                    color: RicoColors.inkFaint,
                    decoration: TextDecoration.lineThrough,
                  ),
                ),
              const SizedBox(height: 6),
              SizedBox(
                height: 32,
                child: busy
                    ? const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 18),
                        child: Center(
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: RicoColors.primary),
                          ),
                        ),
                      )
                    : OutlinedButton.icon(
                        onPressed: onOrder,
                        icon: const Icon(Icons.shopping_basket_rounded, size: 15),
                        label: const Text('اطلبه'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: RicoColors.primary,
                          side: const BorderSide(color: RicoColors.primaryTintStrong),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                        ),
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
