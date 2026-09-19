import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/business_card.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';

/// بطاقة عمل صاحب المهنة.
///
/// هذي الواجهة الوحيدة للشخص في التطبيق: يبنيها هو من ورقة "مهنتي"، يشوفها
/// معاينةً لحظة ما يخلّص، وتظهر للعميل في المحادثة كما هي بالضبط — ما فيه
/// "نسخة بحث" مختصرة و"نسخة ملف" كاملة تنحرفان عن بعض.
///
/// تختلف عمداً عن [PlaceResultCard]: هذي عن **شخص** لا مكان، فما فيها زر
/// اتجاهات ولا تقييم ولا حالة فتح — ما نملك هالبيانات عنه أصلاً، وموقعه
/// نقطة انطلاق شغله لا عنوان يُزار.
///
/// وما فيها رقم جوال: البطاقة عامة يشوفها أي أحد يبحث، فلو حملت الرقم صار
/// الدليل كله قائمة أرقام. الطلب يُرسل والشخص يتصل.
class BusinessCard extends StatelessWidget {
  final BusinessCardData card;

  /// رقم الترتيب في نتائج البحث — null في المعاينة، فبطاقتك ما لها ترتيب.
  final int? rank;

  /// إرسال طلب تواصل. null يعني بطاقة للعرض فقط (مرحلة التأكيد، أو معاينة
  /// بطاقتي أنا).
  final VoidCallback? onRequest;

  /// يظهر بدل زر الطلب في المعاينة — "عدّل البطاقة".
  final VoidCallback? onEdit;

  /// هل هذي البطاقة هي المختارة حالياً؟ تُبرز بحافة بلون البطاقة.
  final bool selected;

  const BusinessCard({
    super.key,
    required this.card,
    this.rank,
    this.onRequest,
    this.onEdit,
    this.selected = false,
  });

  @override
  Widget build(BuildContext context) {
    final accent = card.accent;

    return Container(
      decoration: BoxDecoration(
        color: RicoColors.surface,
        borderRadius: RicoRadii.cardR,
        border: Border.all(color: selected ? accent.bottom : RicoColors.hairline, width: selected ? 1.4 : 1),
        boxShadow: selected ? RicoShadows.raised : RicoShadows.card,
      ),
      // القص لازم عشان التدرّج يأخذ حواف البطاقة العلوية.
      child: ClipRRect(
        borderRadius: RicoRadii.cardR,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Header(card: card, rank: rank),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if ((card.headline ?? '').isNotEmpty) ...[
                    Text(
                      card.headline!,
                      style: RicoText.bodyStrong.copyWith(color: RicoColors.ink),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 7),
                  ],
                  if ((card.bio ?? '').isNotEmpty) ...[
                    Text(
                      card.bio!,
                      // مقصوص على أربعة أسطر: في خيط محادثة، فقرة كاملة عن
                      // كل شخص من خمسة تدفن القائمة نفسها.
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: RicoText.caption.copyWith(height: 1.7),
                    ),
                    const SizedBox(height: 9),
                  ],
                  if (card.skills.isNotEmpty) ...[
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final skill in card.skills) _SkillChip(label: skill, accent: accent),
                      ],
                    ),
                    const SizedBox(height: 9),
                  ],
                  _MetaRow(card: card),
                  if (card.hasCv) ...[
                    const SizedBox(height: 10),
                    _CvButton(card: card),
                  ],
                  if (onRequest != null || onEdit != null) ...[
                    const SizedBox(height: 10),
                    const Divider(color: RicoColors.hairline, height: 1),
                    const SizedBox(height: 4),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: onEdit != null
                          ? TextButton.icon(
                              onPressed: onEdit,
                              icon: const Icon(Icons.tune_rounded, size: 16),
                              label: const Text('عدّل البطاقة'),
                              style: _actionStyle,
                            )
                          : TextButton.icon(
                              onPressed: onRequest,
                              icon: const Icon(Icons.send_rounded, size: 16),
                              label: const Text('أرسل له طلب'),
                              style: _actionStyle,
                            ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static final ButtonStyle _actionStyle = TextButton.styleFrom(
    padding: const EdgeInsets.symmetric(horizontal: 6),
    minimumSize: const Size(0, 34),
  );
}

/// ترويسة البطاقة: تدرّج بلون صاحبها، الأفاتار، الاسم، المهنة، والبُعد.
class _Header extends StatelessWidget {
  final BusinessCardData card;
  final int? rank;

  const _Header({required this.card, this.rank});

  @override
  Widget build(BuildContext context) {
    final accent = card.accent;
    final distance = card.distanceLabel;

    return Container(
      padding: const EdgeInsetsDirectional.fromSTEB(13, 13, 11, 13),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: AlignmentDirectional.topStart,
          end: AlignmentDirectional.bottomEnd,
          colors: [accent.top, accent.bottom],
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _Monogram(initial: card.initial, accent: accent, rank: rank),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  card.name,
                  style: RicoText.cardTitle.copyWith(color: Colors.white, fontSize: 16),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  card.professionLabel,
                  style: RicoText.caption.copyWith(color: Colors.white.withValues(alpha: 0.86)),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          if (distance != null) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: RicoRadii.pillR,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.near_me_rounded, size: 12, color: Colors.white),
                  const SizedBox(width: 4),
                  Text(
                    distance,
                    style: RicoText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// حرف الاسم داخل دائرة بيضاء، مع رقم الترتيب على حافتها — بديل شخصي
/// لشارة الرقم المربّعة في بطاقات الأماكن.
class _Monogram extends StatelessWidget {
  final String initial;
  final CardAccent accent;
  final int? rank;

  const _Monogram({required this.initial, required this.accent, this.rank});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 42,
      height: 42,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
            child: Text(
              initial,
              style: RicoText.title.copyWith(color: accent.bottom, fontSize: 18),
            ),
          ),
          if (rank != null)
            PositionedDirectional(
              start: -3,
              bottom: -3,
              child: Container(
                width: 18,
                height: 18,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: RicoColors.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: accent.tint),
                ),
                child: Text('$rank', style: RicoText.overline.copyWith(color: RicoColors.inkMuted)),
              ),
            ),
        ],
      ),
    );
  }
}

class _SkillChip extends StatelessWidget {
  final String label;
  final CardAccent accent;

  const _SkillChip({required this.label, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: accent.tint,
        borderRadius: RicoRadii.pillR,
        border: Border.all(color: accent.bottom.withValues(alpha: 0.16)),
      ),
      child: Text(
        label,
        style: RicoText.caption.copyWith(color: accent.bottom, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// سنوات الخبرة ومدى الخدمة — ما نعرفه عنه فعلاً، لا أكثر.
class _MetaRow extends StatelessWidget {
  final BusinessCardData card;

  const _MetaRow({required this.card});

  @override
  Widget build(BuildContext context) {
    final chips = <Widget>[
      if (card.yearsExperience != null && card.yearsExperience! > 0)
        MetaChip(icon: Icons.workspace_premium_rounded, label: 'خبرة ${card.yearsExperience} سنة'),
      if ((card.serviceRadiusMeters ?? 0) > 0)
        MetaChip(
          icon: Icons.travel_explore_rounded,
          label: 'يخدم لين ${(card.serviceRadiusMeters! / 1000).round()} كم',
        ),
    ];

    if (chips.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 6, runSpacing: 6, children: chips);
  }
}

/// زر فتح السيرة الذاتية. يفتحها في عارض الجهاز (المتصفح أو قارئ PDF)
/// بدل عرضها داخل التطبيق: الخادم يرسلها بـ`Content-Disposition: inline`
/// فتُعرض لا تُحمّل، وما نحتاج نحزم قارئ PDF لأجل زر.
class _CvButton extends StatelessWidget {
  final BusinessCardData card;

  const _CvButton({required this.card});

  Future<void> _open(BuildContext context) async {
    final url = card.cvUrl;
    if (url == null) return;
    final opened = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ما قدرت أفتح الملف على جهازك.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final accent = card.accent;

    return InkWell(
      onTap: () => _open(context),
      borderRadius: RicoRadii.controlR,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
        decoration: BoxDecoration(
          color: accent.tint,
          borderRadius: RicoRadii.controlR,
          border: Border.all(color: accent.bottom.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            Icon(
              card.cvIsImage ? Icons.image_outlined : Icons.picture_as_pdf_rounded,
              size: 18,
              color: accent.bottom,
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'السيرة الذاتية',
                    style: RicoText.labelStrong.copyWith(color: accent.bottom),
                  ),
                  if ((card.cvFileName ?? '').isNotEmpty)
                    Text(
                      card.cvFileName!,
                      style: RicoText.overline.copyWith(color: RicoColors.inkMuted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            Icon(Icons.open_in_new_rounded, size: 15, color: accent.bottom.withValues(alpha: 0.7)),
          ],
        ),
      ),
    );
  }
}
