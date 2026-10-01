import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'rico_logo_mark.dart';

/// البطاقة الأساسية في كل الشاشات — سطح أبيض على أرضية عاجية، حافة شعرية
/// وظل مزدوج ناعم. كل بطاقة في التطبيق تُبنى فوقها بدل تكرار [BoxDecoration].
class RicoCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;

  /// حافة بلون مميّز (ذهبي للعروض، أخضر للترشيح) بدل الحافة الشعرية العادية.
  final Color? accentBorder;

  /// شريط رفيع بلون مميّز على الحافة الجهوية (بداية القراءة = يمين في RTL).
  final Color? edgeStripe;

  final List<BoxShadow>? shadow;

  const RicoCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.margin,
    this.onTap,
    this.accentBorder,
    this.edgeStripe,
    this.shadow,
  });

  @override
  Widget build(BuildContext context) {
    final stripe = edgeStripe;

    Widget content = Padding(padding: padding, child: child);

    if (stripe != null) {
      // الشريط يُرسم كطبقة فوق المحتوى لا كعمود في Row: صفٌّ بـ stretch يطلب
      // ارتفاعاً لا نهائياً حين تكون البطاقة داخل قائمة تمرير، أما Stack
      // فيأخذ مقاسه من المحتوى نفسه. وBoxDecoration لا يقبل حافة غير متساوية
      // مع borderRadius، فلا يصلح استخدام BorderDirectional هنا.
      content = Stack(
        children: [
          content,
          PositionedDirectional(start: 0, top: 0, bottom: 0, width: 4, child: ColoredBox(color: stripe)),
        ],
      );
    }

    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: RicoColors.surface,
        borderRadius: RicoRadii.cardR,
        border: Border.all(color: accentBorder ?? RicoColors.hairline),
        boxShadow: shadow ?? RicoShadows.card,
      ),
      // القص لازم لأن الشريط الجهوي والتموّج (ripple) يجب ألا يخرجا عن الحواف.
      child: ClipRRect(
        borderRadius: RicoRadii.cardR,
        child: onTap == null
            ? content
            : Material(
                color: Colors.transparent,
                child: InkWell(onTap: onTap, child: content),
              ),
      ),
    );
  }
}

/// وسم بيانات صغير (مسافة، تقييم، سعر، حالة الفتح) — أيقونة + نص داخل حبة
/// غائرة. [tone] يصبغ الأيقونة والنص معاً للحالات المميّزة فقط.
class MetaChip extends StatelessWidget {
  final IconData? icon;
  final String label;
  final Color? tone;
  final bool filled;

  const MetaChip({
    super.key,
    required this.label,
    this.icon,
    this.tone,
    this.filled = true,
  });

  @override
  Widget build(BuildContext context) {
    final color = tone ?? RicoColors.inkMuted;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: filled ? 9 : 0, vertical: filled ? 5 : 0),
      decoration: filled
          ? BoxDecoration(
              color: tone == null ? RicoColors.surfaceSunken : tone!.withValues(alpha: 0.09),
              borderRadius: RicoRadii.pillR,
            )
          : null,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 5),
          ],
          Text(label, style: RicoText.caption.copyWith(color: color)),
        ],
      ),
    );
  }
}

/// وسم علوي بارز (شريحة "ترشيح ريكو"، "عرض"، ...) — خلفية مصبوغة خفيفة مع
/// أيقونة، أقوى بصرياً من [MetaChip].
class RicoBadge extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final Color background;

  const RicoBadge({
    super.key,
    required this.label,
    required this.icon,
    this.color = RicoColors.goldInk,
    this.background = RicoColors.goldTint,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: RicoRadii.pillR,
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 5),
          Text(label, style: RicoText.overline.copyWith(color: color)),
        ],
      ),
    );
  }
}

/// عنوان قسم صغير داخل بطاقة (العروض / المنتجات) — نص خفيف مع خط شعري يمتدّ
/// لآخر السطر، يفصل المجموعات دون ضجيج بصري.
class RicoSectionLabel extends StatelessWidget {
  final String label;
  final IconData? icon;

  const RicoSectionLabel({super.key, required this.label, this.icon});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: RicoColors.inkMuted),
            const SizedBox(width: 6),
          ],
          Text(label, style: RicoText.caption.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(width: 10),
          const Expanded(child: Divider(color: RicoColors.hairline)),
        ],
      ),
    );
  }
}

/// شعار ريكو داخل مربّع مستدير بتدرّج أخضر — العنصر الهوياتي المتكرر (شريط
/// العنوان، شاشة الترحيب، صورة المتحدث). النقطة الذهبية جزء من الشعار نفسه.
class RicoAvatar extends StatelessWidget {
  final double size;

  const RicoAvatar({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [RicoColors.primaryLift, RicoColors.primaryDeep],
        ),
        borderRadius: BorderRadius.circular(size * 0.32),
        boxShadow: RicoShadows.brand,
      ),
      child: RicoLogoMark(
        height: size * 0.5,
        color: Colors.white,
        dotColor: const Color(0xFFE8C765),
        strokeWidth: 30,
      ),
    );
  }
}
