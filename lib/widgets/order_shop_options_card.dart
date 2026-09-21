import 'package:flutter/material.dart';
import '../models/business_catalog.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';

/// المحلات المعروضة على العميل حين ذكر أصنافاً بلا اسم محل ("وصّلي وجبتين
/// شاورما").
///
/// كل محل يقول **وش عنده من طلبك ووش ناقص** قبل ما يضغطه. قائمة أسماء
/// ومسافات وحدها تخلّيه يفتح المحلات وحدة وحدة ليكتشف اللي نعرفه أصلاً،
/// والترتيب نفسه معلومة: الأول هو الأكثر تغطية لطلبه لا الأقرب بالضرورة.
class OrderShopOptionsCard extends StatelessWidget {
  final List<OrderShopOption> options;

  /// اختار محلاً — يُملأ طلبه منه. null أثناء انشغال ريكو بطلب سابق.
  final void Function(OrderShopOption option)? onPick;

  /// المحل الجاري تجهيز الطلب منه الآن، إن وُجد.
  final String? busyShopId;

  const OrderShopOptionsCard({
    super.key,
    required this.options,
    this.onPick,
    this.busyShopId,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < options.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          _ShopTile(
            option: options[i],
            rank: i + 1,
            // ضغطة وحدة أثناء التجهيز تكفي — تعطيل البقية يمنع طلبين
            // متوازيين من محلين، وهو شي ما قصده أحد.
            onPick: busyShopId != null || onPick == null ? null : () => onPick!(options[i]),
            busy: busyShopId == options[i].id,
          ),
        ],
      ],
    );
  }
}

class _ShopTile extends StatelessWidget {
  final OrderShopOption option;
  final int rank;
  final VoidCallback? onPick;
  final bool busy;

  const _ShopTile({required this.option, required this.rank, required this.onPick, required this.busy});

  @override
  Widget build(BuildContext context) {
    final distance = option.distanceLabel;

    return RicoCard(
      onTap: onPick,
      // الحافة الخضراء تميّز من عنده طلبك كاملاً بنظرة وحدة، قبل قراءة أي سطر.
      accentBorder: option.hasAll ? RicoColors.primaryTintStrong : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$rank. ${option.name}',
                  style: RicoText.labelStrong,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (distance != null) ...[
                const SizedBox(width: 8),
                MetaChip(icon: Icons.near_me_rounded, label: distance, filled: false),
              ],
            ],
          ),
          const SizedBox(height: 8),
          _Availability(option: option),
          const SizedBox(height: 10),
          SizedBox(
            height: 38,
            child: busy
                ? const Center(
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: RicoColors.primary),
                    ),
                  )
                : OutlinedButton.icon(
                    onPressed: onPick,
                    icon: const Icon(Icons.shopping_basket_rounded, size: 16),
                    label: Text(option.hasNone ? 'شوف قائمتهم' : 'اطلب من هنا'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: RicoColors.primary,
                      side: const BorderSide(color: RicoColors.primaryTintStrong),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// سطر «عندهم/ما عندهم» — الغرض منه إن العميل يقرر بلا ما يفتح المحل.
class _Availability extends StatelessWidget {
  final OrderShopOption option;

  const _Availability({required this.option});

  @override
  Widget build(BuildContext context) {
    // ما طلب صنفاً بعينه (قال "وجبة") — ما فيه وش نقارن عليه، وادّعاء
    // توفّر أو نقص هنا اختراع.
    if (option.has.isEmpty && option.missing.isEmpty) {
      return Text(
        'قائمتهم جاهزة تختار منها',
        style: RicoText.caption.copyWith(color: RicoColors.inkMuted),
      );
    }

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final item in option.has)
          MetaChip(icon: Icons.check_rounded, label: item, tone: RicoColors.primary),
        for (final item in option.missing)
          MetaChip(icon: Icons.remove_rounded, label: 'ما فيه $item', tone: RicoColors.inkFaint),
      ],
    );
  }
}
