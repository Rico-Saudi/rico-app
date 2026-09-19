import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/deal.dart';
import '../models/place_result.dart';
import '../services/favorites_service.dart';
import '../theme/app_theme.dart';
import 'place_photo.dart';
import 'rico_surfaces.dart';

/// بطاقة نتيجة مكان داخل المحادثة — صورة المكان، ثم الاسم والعنوان، ثم وسوم
/// البيانات المتوفرة فعلياً فقط (لا وسم لبيانات غير موجودة). النقر على
/// البطاقة يفتح اتجاهات خرائط جوجل الحقيقية.
///
/// رقم الترتيب وزر الحفظ يطفوان فوق الصورة بدل صفٍّ خاص بهما فوق النص: الصورة
/// أخذت مكانها أصلاً، وإفراد صفٍّ لهما كان يضيف ارتفاعاً لبطاقة صارت أطول.
class PlaceResultCard extends StatefulWidget {
  final PlaceResult place;
  final int rank;

  /// متوفر فقط للأنشطة الحقيقية في قاعدة ريكو (source == 'rico').
  final VoidCallback? onViewCatalog;

  /// تُبلّغ الشاشة الأم بتغيّر حالة الحفظ — تحتاجها شاشة المفضّلة لتُسقط
  /// البطاقة فوراً بعد إزالتها، وإلا بقيت معروضة وهي مشطوبة أصلاً.
  final VoidCallback? onFavoriteChanged;

  const PlaceResultCard({
    super.key,
    required this.place,
    required this.rank,
    this.onViewCatalog,
    this.onFavoriteChanged,
  });

  @override
  State<PlaceResultCard> createState() => _PlaceResultCardState();
}

class _PlaceResultCardState extends State<PlaceResultCard> {
  final FavoritesService _favoritesService = FavoritesService();
  bool _isFavorite = false;

  @override
  void initState() {
    super.initState();
    _favoritesService.isFavorite(widget.place.osmId).then((value) {
      if (mounted) setState(() => _isFavorite = value);
    });
  }

  Future<void> _toggleFavorite() async {
    final newState = await _favoritesService.toggle(widget.place);
    if (!mounted) return;
    setState(() => _isFavorite = newState);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(newState ? 'حفظته لك في المفضّلة' : 'شلته من المفضّلة'),
        duration: const Duration(seconds: 2),
      ),
    );
    widget.onFavoriteChanged?.call();
  }

  Future<void> _openDirections() async {
    final uri = Uri.parse(widget.place.directionsUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final place = widget.place;
    final isOpen = place.isOpenNow;

    return RicoCard(
      onTap: _openDirections,
      // الصورة تمتد لحواف البطاقة، فالحشو انتقل للنص وحده تحتها.
      padding: EdgeInsets.zero,
      shadow: RicoShadows.subtle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PlacePhoto(
            place: place,
            categorySlug: place.categorySlug,
            overlays: [
              PositionedDirectional(
                top: 10,
                start: 10,
                child: _RankBadge(rank: widget.rank),
              ),
              PositionedDirectional(
                top: 8,
                end: 8,
                child: PhotoOverlayButton(
                  icon: _isFavorite ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                  tone: _isFavorite ? RicoColors.primary : RicoColors.inkMuted,
                  tooltip: _isFavorite ? 'إزالة من المفضّلة' : 'حفظ في المفضّلة',
                  onTap: _toggleFavorite,
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(13, 11, 13, 13),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(place.name, style: RicoText.cardTitle, maxLines: 2, overflow: TextOverflow.ellipsis),
                if (place.address.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(place.address, style: RicoText.caption, maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (place.distanceMeters != null) MetaChip(icon: Icons.near_me_rounded, label: place.distanceLabel),
                    if (place.ratingLabel != null)
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
                if (widget.onViewCatalog != null) ...[
                  const SizedBox(height: 11),
                  const Divider(color: RicoColors.hairline, height: 1),
                  const SizedBox(height: 5),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      onPressed: widget.onViewCatalog,
                      icon: const Icon(Icons.storefront_rounded, size: 16),
                      label: const Text('شوف المنتجات والعروض'),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        minimumSize: const Size(0, 34),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// بطاقة عرض/خصم — تُميّز بالذهبي (اللون الثانوي للعلامة) وشريط جهوي، فتُقرأ
/// كنوع مختلف من النتائج بلمحة واحدة دون قراءة عنوانها.
class DealResultCard extends StatelessWidget {
  final Deal deal;

  const DealResultCard({super.key, required this.deal});

  Future<void> _copyCode(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: deal.promoCode!));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('نسخت الكود ${deal.promoCode}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return RicoCard(
      padding: const EdgeInsets.all(13),
      accentBorder: RicoColors.gold.withValues(alpha: 0.35),
      edgeStripe: RicoColors.gold,
      shadow: RicoShadows.subtle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: RicoColors.goldTint,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(Icons.local_offer_rounded, size: 17, color: RicoColors.goldInk),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(deal.placeName, style: RicoText.cardTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 3),
                    Text(deal.titleAr,
                        style: RicoText.label.copyWith(color: RicoColors.goldInk, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          if (deal.descriptionAr != null && deal.descriptionAr!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(deal.descriptionAr!, style: RicoText.caption.copyWith(height: 1.6)),
          ],
          if (deal.distanceMeters != null || deal.promoCode != null) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (deal.distanceMeters != null) MetaChip(icon: Icons.near_me_rounded, label: deal.distanceLabel),
                if (deal.promoCode != null)
                  // كود الخصم قابل للنسخ — الفائدة الحقيقية منه أن يُلصق في
                  // تطبيق المتجر، لا أن يُقرأ من الشاشة.
                  InkWell(
                    onTap: () => _copyCode(context),
                    borderRadius: RicoRadii.pillR,
                    child: MetaChip(
                      icon: Icons.copy_rounded,
                      label: deal.promoCode!,
                      tone: RicoColors.primary,
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// رقم ترتيب النتيجة — المرتبة الأولى بالأخضر الممتلئ، وما بعدها بتعبئة
/// خفيفة، فتُقرأ الأولوية بلا نص إضافي.
class _RankBadge extends StatelessWidget {
  final int rank;

  const _RankBadge({required this.rank});

  @override
  Widget build(BuildContext context) {
    final isFirst = rank == 1;
    return Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: isFirst ? RicoColors.primary : RicoColors.primaryTint,
        shape: BoxShape.circle,
      ),
      child: Text(
        '$rank',
        style: RicoText.caption.copyWith(
          color: isFirst ? Colors.white : RicoColors.primaryDeep,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
