/// مدن يختار منها العميل لما يكون GPS مرفوض أو مطفّي — مركز كل مدينة
/// تقريباً. نقطة انطلاق تقريبية تكفي لـ«أقرب صيدلية» بمدينته، وأحسن بكثير
/// من ريكو واقف لأن الإذن مرفوض.
class ManualCities {
  ManualCities._();

  static const List<({double lat, double lng, String name})> saudi = [
    (lat: 24.7136, lng: 46.6753, name: 'الرياض'),
    (lat: 21.5433, lng: 39.1728, name: 'جدة'),
    (lat: 21.3891, lng: 39.8579, name: 'مكة المكرمة'),
    (lat: 24.5247, lng: 39.5692, name: 'المدينة المنورة'),
    (lat: 26.4207, lng: 50.0888, name: 'الدمام'),
    (lat: 26.2172, lng: 50.1971, name: 'الخبر'),
    (lat: 21.2703, lng: 40.4158, name: 'الطائف'),
    (lat: 18.2164, lng: 42.5053, name: 'أبها'),
    (lat: 28.3835, lng: 36.5662, name: 'تبوك'),
    (lat: 26.3260, lng: 43.9750, name: 'بريدة'),
  ];

  static const List<({double lat, double lng, String name})> jordan = [
    (lat: 31.9539, lng: 35.9106, name: 'عمّان'),
    (lat: 32.5556, lng: 35.8500, name: 'إربد'),
    (lat: 32.0728, lng: 36.0880, name: 'الزرقاء'),
    (lat: 29.5321, lng: 35.0063, name: 'العقبة'),
    (lat: 32.0392, lng: 35.7272, name: 'السلط'),
    (lat: 31.7197, lng: 35.7956, name: 'مادبا'),
  ];

  /// مدن بلد العلامة: «تدلل» أردنية، و«ريكو» سعودية.
  static List<({double lat, double lng, String name})> forBrand(String brandSlug) =>
      brandSlug == 'tadallal' ? jordan : saudi;
}
