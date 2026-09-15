import 'package:flutter/material.dart';
import '../models/professional.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';

/// بطاقة صاحب مهنة داخل المحادثة.
///
/// تختلف عمداً عن [PlaceResultCard]: هذي عن **شخص** لا مكان، فما فيها زر
/// اتجاهات ولا تقييم ولا حالة فتح — ما نملك هالبيانات عنه أصلاً، وموقعه
/// نقطة انطلاق شغله لا عنوان يُزار. الظاهر هو ما نعرفه فعلاً: اسمه، مهنته،
/// وصفه لشغله، وكم يبعد عنك.
class ProfessionalCard extends StatelessWidget {
  final Professional professional;
  final int rank;

  /// إرسال طلب تواصل — null يعني بطاقة للعرض فقط (داخل مرحلة التأكيد).
  final VoidCallback? onRequest;

  /// هل هذي البطاقة هي المختارة حالياً؟ تُبرز بحافة خضراء.
  final bool selected;

  const ProfessionalCard({
    super.key,
    required this.professional,
    required this.rank,
    this.onRequest,
    this.selected = false,
  });

  @override
  Widget build(BuildContext context) {
    return RicoCard(
      padding: const EdgeInsets.all(13),
      shadow: RicoShadows.subtle,
      accentBorder: selected ? RicoColors.primaryTintStrong : null,
      edgeStripe: selected ? RicoColors.primary : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _InitialAvatar(initial: professional.initial, rank: rank),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      professional.name,
                      style: RicoText.cardTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      professional.professionLabel,
                      style: RicoText.caption.copyWith(color: RicoColors.primary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (professional.headline != null && professional.headline!.isNotEmpty) ...[
            const SizedBox(height: 9),
            Text(
              professional.headline!,
              style: RicoText.caption,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              MetaChip(icon: Icons.near_me_rounded, label: professional.distanceLabel),
              if (professional.serviceRadiusMeters > 0)
                MetaChip(
                  icon: Icons.travel_explore_rounded,
                  label: 'يخدم لين ${(professional.serviceRadiusMeters / 1000).round()} كم',
                ),
            ],
          ),
          if (onRequest != null) ...[
            const SizedBox(height: 11),
            const Divider(color: RicoColors.hairline, height: 1),
            const SizedBox(height: 5),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: onRequest,
                icon: const Icon(Icons.send_rounded, size: 16),
                label: const Text('أرسل له طلب'),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: const Size(0, 34),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// حرف الاسم داخل دائرة، مع رقم الترتيب على حافتها — بديل شخصي لشارة الرقم
/// المربّعة في بطاقات الأماكن.
class _InitialAvatar extends StatelessWidget {
  final String initial;
  final int rank;

  const _InitialAvatar({required this.initial, required this.rank});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 38,
      height: 38,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: RicoColors.primaryTint, shape: BoxShape.circle),
            child: Text(
              initial,
              style: RicoText.bodyStrong.copyWith(color: RicoColors.primaryDeep),
            ),
          ),
          PositionedDirectional(
            start: -3,
            bottom: -3,
            child: Container(
              width: 17,
              height: 17,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: RicoColors.surface,
                shape: BoxShape.circle,
                border: Border.all(color: RicoColors.hairline),
              ),
              child: Text('$rank', style: RicoText.overline.copyWith(color: RicoColors.inkMuted)),
            ),
          ),
        ],
      ),
    );
  }
}
