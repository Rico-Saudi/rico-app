import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/price_comparison.dart';
import '../models/web_offer.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';

/// يفتح رابط عرض من الإنترنت بمتصفح الجهاز — صفحة خارجية، فما تنفتح داخل
/// التطبيق كأنها منه.
Future<void> _openLink(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  final opened = uri != null && await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('ما قدرت أفتح الرابط على جهازك.')),
    );
  }
}

/// عنوان القسم: يفرّق عروض الإنترنت عن عروض المحلات المسجّلة بنظرة. اللي
/// فوقه ينطلب من التطبيق، واللي تحته رابط لموقع ثاني — خلطهم يخلّي العميل
/// يتوقع إن ريكو يطلب له عرض ما يقدر عليه.
class _WebHeader extends StatelessWidget {
  final String title;

  const _WebHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.public_rounded, size: 16, color: RicoColors.inkMuted),
              const SizedBox(width: 6),
              Text(title, style: RicoText.labelStrong),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            'من مواقع خارج التطبيق — تأكد من التفاصيل والمدة عندهم',
            style: RicoText.caption.copyWith(color: RicoColors.inkMuted),
          ),
        ],
      ),
    );
  }
}

/// "وش العروض؟" — عروض لقيناها على الإنترنت، تحت عروض المحلات المسجّلة.
class WebOffersSection extends StatelessWidget {
  final List<WebOffer> offers;

  const WebOffersSection({super.key, required this.offers});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _WebHeader(title: 'عروض من الإنترنت'),
        for (final offer in offers)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _WebOfferTile(offer: offer),
          ),
      ],
    );
  }
}

class _WebOfferTile extends StatelessWidget {
  final WebOffer offer;

  const _WebOfferTile({required this.offer});

  @override
  Widget build(BuildContext context) {
    final discount = offer.discount;
    final until = offer.validUntil;

    return RicoCard(
      onTap: () => _openLink(context, offer.url),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(offer.store, style: RicoText.labelStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              if (discount != null) ...[
                const SizedBox(width: 8),
                MetaChip(icon: Icons.local_offer_rounded, label: discount, tone: RicoColors.goldInk),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Text(offer.headline, style: RicoText.body, maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (until != null) MetaChip(icon: Icons.event_rounded, label: 'لين $until', filled: false),
              MetaChip(icon: Icons.open_in_new_rounded, label: offer.source, filled: false),
            ],
          ),
        ],
      ),
    );
  }
}

/// "قارن وين أرخص جبنة" — أسعار أونلاين تحت مقارنة المحلات القريبة.
class WebPricesSection extends StatelessWidget {
  final List<WebPriceComparison> comparisons;

  const WebPricesSection({super.key, required this.comparisons});

  @override
  Widget build(BuildContext context) {
    final withOffers = comparisons.where((c) => c.offers.isNotEmpty).toList();
    final titled = withOffers.length > 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _WebHeader(title: 'أسعاره أونلاين'),
        for (final comparison in withOffers)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: RicoCard(
              padding: EdgeInsets.zero,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (titled)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                      child: Text(comparison.requested, style: RicoText.labelStrong),
                    ),
                  for (var i = 0; i < comparison.offers.length; i++) ...[
                    if (i > 0) const Divider(height: 1, thickness: 1, color: RicoColors.hairline),
                    _WebPriceRow(price: comparison.offers[i]),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _WebPriceRow extends StatelessWidget {
  final WebPrice price;

  const _WebPriceRow({required this.price});

  @override
  Widget build(BuildContext context) {
    final delivery = price.delivery;

    return InkWell(
      onTap: () => _openLink(context, price.url),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(price.store, style: RicoText.labelStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(
                    price.title,
                    style: RicoText.caption.copyWith(color: RicoColors.inkBody),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (delivery != null) ...[
                    const SizedBox(height: 4),
                    MetaChip(icon: Icons.local_shipping_rounded, label: delivery, filled: false),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('${formatPrice(price.price)} ${price.currencyLabel}', style: RicoText.cardTitle),
                const SizedBox(height: 2),
                const Icon(Icons.open_in_new_rounded, size: 14, color: RicoColors.inkFaint),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
