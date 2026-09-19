import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/place_result.dart';
import '../services/intent_service.dart';
import '../theme/app_theme.dart';
import 'place_photo.dart';
import 'rico_surfaces.dart';

/// بطاقة الترشيح الأول المميّزة — أبرز عنصر بصري في المحادثة: صورة كبيرة،
/// حافة خضراء، شريحة ذهبية، وظل مرفوع. صورتها أعرض من صور بقية النتائج عمداً
/// (٣:٢ لا ١٦:٩) — هي المرشّح، ويُفترض أن تُرى قبل غيرها.
///
/// النص التوضيحي "ليش رشّحته" مشتق من سبب الترتيب الفعلي ([QueryIntent.rank])
/// وبيانات [place] الحقيقية فقط، لا صياغة تسويقية مختلقة. الزر الثانوي يفتح
/// اتجاهات خرائط جوجل الحقيقية.
class RecommendedPickCard extends StatelessWidget {
  final PlaceResult place;
  final QueryIntent intent;
  final VoidCallback onOrder;

  const RecommendedPickCard({
    super.key,
    required this.place,
    required this.intent,
    required this.onOrder,
  });

  String get _reasonAr {
    switch (intent.rank) {
      case RankMode.cheapest:
        return place.priceLevel != null
            ? 'الأرخص ضمن ${intent.label} القريبة منك حسب بيانات الأسعار المتوفرة'
            : 'الأقرب لك ضمن ${intent.label} — والأقرب غالباً أوفر لأنك توفّر وقت ومشوار';
      case RankMode.bestRated:
        return place.rating != null
            ? 'الأعلى تقييماً (${place.rating!.toStringAsFixed(1)}) ضمن ${intent.label} القريبة منك'
            : 'أفضل خيار متاح ضمن ${intent.label} القريبة منك';
      case RankMode.openNow:
        return 'من أقرب ${intent.label} المتأكّد أنها مفتوحة الحين';
      case RankMode.nearest:
        return 'الأقرب لموقعك الحالي ضمن ${intent.label}';
    }
  }

  Future<void> _openDirections() async {
    final uri = Uri.parse(place.directionsUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOpen = place.isOpenNow;

    return RicoCard(
      padding: EdgeInsets.zero,
      accentBorder: RicoColors.primaryTintStrong,
      shadow: RicoShadows.raised,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ترويسة مصبوغة خفيفاً تفصل "لماذا هذه البطاقة مميّزة" عن بياناتها.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: const BoxDecoration(
              color: RicoColors.primaryTint,
              border: Border(bottom: BorderSide(color: RicoColors.primaryTintStrong)),
            ),
            child: Row(
              children: [
                const RicoBadge(label: 'ترشيح ريكو', icon: Icons.verified_rounded),
                const Spacer(),
                Text('الخيار الأول', style: RicoText.caption.copyWith(color: RicoColors.primaryDeep)),
              ],
            ),
          ),
          PlacePhoto(
            place: place,
            categorySlug: place.categorySlug,
            aspectRatio: 3 / 2,
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(place.name, style: RicoText.display.copyWith(fontSize: 19)),
                if (place.address.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(place.address, style: RicoText.caption),
                ],
                const SizedBox(height: 11),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (place.distanceMeters != null) MetaChip(icon: Icons.near_me_rounded, label: place.distanceLabel),
                    if (place.rating != null)
                      MetaChip(
                        icon: Icons.star_rounded,
                        label: place.ratingCount != null
                            ? '${place.rating!.toStringAsFixed(1)} (${place.ratingCount})'
                            : place.rating!.toStringAsFixed(1),
                        tone: RicoColors.goldInk,
                      ),
                    if (place.priceLevelLabel != null) MetaChip(label: place.priceLevelLabel!),
                    if (isOpen != null)
                      MetaChip(
                        icon: isOpen ? Icons.schedule_rounded : Icons.lock_clock,
                        label: isOpen ? 'مفتوح الحين' : 'مغلق الحين',
                        tone: isOpen ? RicoColors.success : RicoColors.danger,
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(11),
                  decoration: const BoxDecoration(
                    color: RicoColors.surfaceSunken,
                    borderRadius: RicoRadii.controlR,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.lightbulb_outline_rounded, size: 15, color: RicoColors.goldInk),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('ليش رشّحته؟',
                                style: RicoText.caption.copyWith(fontWeight: FontWeight.w700, color: RicoColors.ink)),
                            const SizedBox(height: 2),
                            Text(_reasonAr, style: RicoText.caption.copyWith(height: 1.6)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 13),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _openDirections,
                        icon: const Icon(Icons.directions_rounded, size: 17),
                        label: const Text('الاتجاهات'),
                      ),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: onOrder,
                        icon: const Icon(Icons.shopping_bag_rounded, size: 17),
                        label: const Text('اطلبه'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
