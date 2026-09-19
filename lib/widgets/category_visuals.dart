import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// الهوية البصرية لكل فئة مكان: أيقونتها ولون خلفيتها حين لا توجد صورة.
///
/// مصدر واحد تشترك فيه بطاقة "فهمت طلبك" ([UnderstandingCard]) وصورة النتيجة
/// ([PlacePhoto])، فما تختلف أيقونة الفئة بين مرحلة الفهم ومرحلة النتيجة —
/// المستخدم يشوف نفس الرمز في الحالتين فيقرأها كشيء واحد.
class CategoryVisuals {
  const CategoryVisuals._();

  static const Map<String, IconData> icons = {
    'restaurant': Icons.restaurant_rounded,
    'cafe': Icons.local_cafe_rounded,
    'pharmacy': Icons.local_pharmacy_rounded,
    'supermarket': Icons.local_grocery_store_rounded,
    'fuel': Icons.local_gas_station_rounded,
    'mall': Icons.storefront_rounded,
    'atm': Icons.atm_rounded,
    'bank': Icons.account_balance_rounded,
    'hospital': Icons.local_hospital_rounded,
    'clinic': Icons.medical_services_rounded,
    'fitness_centre': Icons.fitness_center_rounded,
    'hotel': Icons.hotel_rounded,
    'clothes': Icons.checkroom_rounded,
    'mobile_phone': Icons.smartphone_rounded,
    'electronics': Icons.devices_other_rounded,
    'hairdresser': Icons.content_cut_rounded,
    'beauty': Icons.spa_rounded,
    'car_wash': Icons.local_car_wash_rounded,
    'dentist': Icons.medical_information_rounded,
    'mosque': Icons.mosque_rounded,
    'park': Icons.park_rounded,
    'bakery': Icons.bakery_dining_rounded,
    'sweets': Icons.cake_rounded,
    'bookstore': Icons.menu_book_rounded,
    'toy_store': Icons.toys_rounded,
    'pet_store': Icons.pets_rounded,
    'jewelry_store': Icons.diamond_rounded,
    'furniture_store': Icons.chair_rounded,
    'shoe_store': Icons.ice_skating_rounded,
    'gift_shop': Icons.card_giftcard_rounded,
    'florist': Icons.local_florist_rounded,
    'laundry': Icons.local_laundry_service_rounded,
    'veterinary': Icons.pets_rounded,
    'car_repair': Icons.car_repair_rounded,
    'car_dealer': Icons.directions_car_rounded,
    'car_rental': Icons.car_rental_rounded,
    'parking': Icons.local_parking_rounded,
    'lawyer': Icons.gavel_rounded,
    'real_estate': Icons.home_work_rounded,
    'travel_agency': Icons.flight_takeoff_rounded,
    'insurance': Icons.shield_rounded,
  };

  static IconData iconFor(String? slug) => icons[slug] ?? Icons.place_rounded;

  /// ألوان الخلفية البديلة عن الصورة. كلها من لوحة العلامة نفسها ومشتقاتها
  /// الهادئة — الغرض تمييز البطاقات عن بعض لا لفت النظر لغياب الصورة.
  static const List<Color> _tints = [
    RicoColors.primaryTint,
    RicoColors.goldTint,
    RicoColors.surfaceSunken,
    RicoColors.primaryTintStrong,
  ];

  static const List<Color> _inks = [
    RicoColors.primaryDeep,
    RicoColors.goldInk,
    RicoColors.inkMuted,
    RicoColors.primaryDeep,
  ];

  /// لون ثابت لكل فئة (مشتق من اسمها لا عشوائي) — نفس الفئة تطلع بنفس اللون
  /// في كل بحث، فتُبنى ألفة بصرية بدل وميض ألوان متغيّرة.
  static int _slot(String? slug) {
    if (slug == null || slug.isEmpty) return 0;
    var hash = 0;
    for (final unit in slug.codeUnits) {
      hash = (hash + unit) % _tints.length;
    }
    return hash;
  }

  static Color tintFor(String? slug) => _tints[_slot(slug)];

  static Color inkFor(String? slug) => _inks[_slot(slug)];
}
