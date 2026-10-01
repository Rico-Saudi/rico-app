import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../models/customer_order.dart';
import '../theme/app_theme.dart';

/// تنسيق سعر: بلا كسور حين يكون صحيحاً — نفس صياغة بطاقة المتجر.
String money(double value) {
  final rounded = value.roundToDouble();
  return value == rounded ? rounded.toStringAsFixed(0) : value.toStringAsFixed(2);
}

/// العربية تجمع جمع قلة لما دون العشرة وتفرد التمييز بعدها.
String piecesLabel(int count) {
  if (count == 1) return 'قطعة';
  if (count == 2) return 'قطعتان';
  if (count <= 10) return 'قطع';
  return 'قطعة';
}

/// حالة الطلب من زاوية العميل لا من زاوية المحل: العميل لا يعنيه أن المحل
/// «تعامل مع» الطلب في لوحته، يعنيه أنه تواصل معه أو لم يتواصل بعد.
class OrderStatusChip extends StatelessWidget {
  final OrderStatus status;
  final bool large;

  const OrderStatusChip({super.key, required this.status, this.large = false});

  @override
  Widget build(BuildContext context) {
    final handled = status == OrderStatus.handled;
    final tone = handled ? RicoColors.success : RicoColors.goldInk;
    final background = handled ? RicoColors.primaryTint : RicoColors.goldTint;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: large ? 11 : 9, vertical: large ? 6 : 4),
      decoration: BoxDecoration(color: background, borderRadius: RicoRadii.pillR),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(handled ? Icons.check_circle_rounded : Icons.schedule_rounded, size: large ? 14 : 12, color: tone),
          const SizedBox(width: 5),
          Text(
            handled ? 'تواصل معك' : 'بانتظار المحل',
            style: (large ? RicoText.caption : RicoText.overline).copyWith(color: tone, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// صورة صنف في الطلب — رمز الحقيبة (أو وسم العرض) هو حالة التحميل وحالة
/// «بلا صورة» وحالة الفشل معاً، فلا يمرّ المستخدم على مربع رمادي فاضٍ.
class OrderLineImage extends StatelessWidget {
  final OrderLine line;
  final double size;

  const OrderLineImage({super.key, required this.line, this.size = 44});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.22),
      child: SizedBox(
        width: size,
        height: size,
        child: line.isDeal || line.imageUrl == null
            ? _Fallback(isDeal: line.isDeal)
            : CachedNetworkImage(
                imageUrl: line.imageUrl!,
                fit: BoxFit.cover,
                fadeInDuration: const Duration(milliseconds: 200),
                memCacheWidth: 200,
                placeholder: (_, __) => const _Fallback(isDeal: false),
                errorWidget: (_, __, ___) => const _Fallback(isDeal: false),
              ),
      ),
    );
  }
}

class _Fallback extends StatelessWidget {
  final bool isDeal;

  const _Fallback({required this.isDeal});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: isDeal ? RicoColors.goldTint : RicoColors.surfaceSunken,
      child: Icon(
        isDeal ? Icons.local_offer_rounded : Icons.shopping_bag_outlined,
        size: 18,
        color: isDeal ? RicoColors.goldInk : RicoColors.inkFaint,
      ),
    );
  }
}

/// صور أصناف الطلب متراكبة — ثلاث صور ثم عدّاد بالباقي، فيُعرف الطلب من
/// شكله قبل قراءة سطر واحد.
class OrderLineThumbnails extends StatelessWidget {
  final List<OrderLine> lines;

  const OrderLineThumbnails({super.key, required this.lines});

  static const double _size = 42;
  static const double _overlap = 13;
  static const int _max = 3;

  @override
  Widget build(BuildContext context) {
    if (lines.isEmpty) return const SizedBox(width: _size, height: _size);

    final shown = lines.take(_max).toList();
    final extra = lines.length - shown.length;
    final slots = shown.length + (extra > 0 ? 1 : 0);

    return SizedBox(
      width: _size + (slots - 1) * (_size - _overlap),
      height: _size,
      child: Stack(
        children: [
          for (var i = 0; i < shown.length; i++)
            PositionedDirectional(
              start: i * (_size - _overlap),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(_size * 0.22),
                  // إطار بلون الخلفية يفصل الصور المتراكبة عن بعضها.
                  border: Border.all(color: RicoColors.surface, width: 2),
                ),
                child: OrderLineImage(line: shown[i], size: _size - 4),
              ),
            ),
          if (extra > 0)
            PositionedDirectional(
              start: shown.length * (_size - _overlap),
              child: Container(
                width: _size,
                height: _size,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: RicoColors.surfaceSunken,
                  borderRadius: BorderRadius.circular(_size * 0.22),
                  border: Border.all(color: RicoColors.surface, width: 2),
                ),
                child: Text('+$extra', style: RicoText.caption.copyWith(fontWeight: FontWeight.w700)),
              ),
            ),
        ],
      ),
    );
  }
}
