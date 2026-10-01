import 'package:flutter/material.dart';
import '../services/intent_service.dart';
import '../theme/app_theme.dart';
import 'category_visuals.dart';
import 'rico_surfaces.dart';

/// بطاقة "فهمت طلبك" — تعرض وسوماً مشتقة فعلياً من [QueryIntent] فقط (لا وسوم
/// وهمية مثل المناسبة أو عدد الأشخاص، لأن المصنّف لا يستخرج هذه البيانات).
/// وجودها يطمئن المستخدم أن طلبه فُهم كما قصده قبل وصول النتائج.
class UnderstandingCard extends StatelessWidget {
  final QueryIntent intent;

  const UnderstandingCard({super.key, required this.intent});


  /// أيقونة لكل مهنة. الناقص منها يقع على أيقونة عامة لـ"صاحب مهنة" بدل
  /// أيقونة مكان — المقصود شخص، والفرق يظهر بلمحة قبل وصول النتائج.
  static const Map<String, IconData> _professionIcons = {
    'painter': Icons.format_paint_rounded,
    'electrician': Icons.electrical_services_rounded,
    'plumber': Icons.plumbing_rounded,
    'carpenter': Icons.carpenter_rounded,
    'ac_technician': Icons.ac_unit_rounded,
    'blacksmith': Icons.hardware_rounded,
    'welder': Icons.local_fire_department_rounded,
    'tiler': Icons.grid_view_rounded,
    'plasterer': Icons.roller_shades_rounded,
    'aluminum_glass': Icons.window_rounded,
    'insulation': Icons.roofing_rounded,
    'mover': Icons.local_shipping_rounded,
    'cleaner': Icons.cleaning_services_rounded,
    'water_tank_cleaning': Icons.water_drop_rounded,
    'pest_control': Icons.pest_control_rounded,
    'gardener': Icons.yard_rounded,
    'appliance_repair': Icons.home_repair_service_rounded,
    'phone_repair': Icons.smartphone_rounded,
    'it_support': Icons.computer_rounded,
    'cctv': Icons.videocam_rounded,
    'satellite_technician': Icons.settings_input_antenna_rounded,
    'car_mechanic': Icons.car_repair_rounded,
    'driver': Icons.drive_eta_rounded,
    'chef': Icons.restaurant_menu_rounded,
    'tailor': Icons.content_cut_rounded,
    'photographer': Icons.photo_camera_rounded,
    'tutor': Icons.school_rounded,
    'home_nurse': Icons.medical_services_rounded,
  };

  IconData get _categoryIcon => switch (intent.kind) {
        IntentKind.deals => Icons.local_offer_rounded,
        IntentKind.professional => _professionIcons[intent.profession] ?? Icons.engineering_rounded,
        IntentKind.order => Icons.shopping_basket_rounded,
        IntentKind.place => CategoryVisuals.iconFor(intent.slug),
      };

  List<({IconData icon, String label})> get _tags {
    if (intent.kind == IntentKind.deals) {
      return [(icon: Icons.local_offer_rounded, label: 'العروض القريبة')];
    }

    // طلب من محل مسمّى: الوسمان الصادقان هما المحل وعدد الأصناف المطلوبة —
    // لا فئة ولا ترتيب، فالمستخدم حدّد كل شي بنفسه.
    if (intent.kind == IntentKind.order) {
      return [
        (icon: Icons.storefront_rounded, label: intent.placeName ?? intent.label),
        (icon: Icons.shopping_basket_rounded, label: '${intent.orderItems.length} أصناف'),
      ];
    }

    // أصحاب المهن ما ينطبق عليهم ترتيب بسعر ولا تقييم ولا حالة فتح — الوسم
    // الوحيد الصادق هو المهنة نفسها وأنهم الأقرب.
    if (intent.kind == IntentKind.professional) {
      return [
        (icon: _categoryIcon, label: intent.label),
        (icon: Icons.near_me_rounded, label: 'الأقرب لك'),
      ];
    }

    final tags = <({IconData icon, String label})>[
      (icon: _categoryIcon, label: intent.label),
    ];

    switch (intent.rank) {
      case RankMode.cheapest:
        tags.add((icon: Icons.savings_rounded, label: 'الأرخص'));
      case RankMode.bestRated:
        tags.add((icon: Icons.star_rounded, label: 'الأعلى تقييماً'));
      case RankMode.openNow:
        tags.add((icon: Icons.schedule_rounded, label: 'مفتوح الحين'));
      case RankMode.nearest:
        tags.add((icon: Icons.near_me_rounded, label: 'الأقرب لك'));
    }

    if (intent.brandHint != null && intent.brandHint!.trim().isNotEmpty) {
      tags.add((icon: Icons.business_rounded, label: intent.brandHint!));
    }

    return tags;
  }

  @override
  Widget build(BuildContext context) {
    return RicoCard(
      padding: const EdgeInsets.all(13),
      shadow: RicoShadows.subtle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: const BoxDecoration(color: RicoColors.primary, shape: BoxShape.circle),
                child: const Icon(Icons.check_rounded, size: 13, color: Colors.white),
              ),
              const SizedBox(width: 8),
              const Text('فهمت طلبك', style: RicoText.labelStrong),
            ],
          ),
          const SizedBox(height: 11),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final tag in _tags)
                MetaChip(icon: tag.icon, label: tag.label, tone: RicoColors.primaryDeep),
            ],
          ),
        ],
      ),
    );
  }
}
