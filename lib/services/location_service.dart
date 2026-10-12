import 'dart:async';

import 'package:geolocator/geolocator.dart';

/// نوع مشكلة الموقع، يستخدم لتحديد ما إذا كان يجدر عرض زر "فتح الإعدادات"
/// وأي إعدادات يفتح (إعدادات الموقع نفسه أو إعدادات إذن التطبيق).
enum LocationErrorType { serviceDisabled, permissionDenied, permissionDeniedForever, unknown }

class LocationException implements Exception {
  final String message;
  final LocationErrorType type;
  LocationException(this.message, {this.type = LocationErrorType.unknown});
  @override
  String toString() => message;
}

class LocationService {
  /// يطلب صلاحية الموقع (إن لم تُمنح) ثم يرجع الموقع الحالي للمستخدم
  Future<Position> getCurrentLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw LocationException(
        'خدمة الموقع مو مفعّلة في جهازك. فعّلها من الإعدادات وحاول مرة ثانية.',
        type: LocationErrorType.serviceDisabled,
      );
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw LocationException(
          'أحتاج إذنك عشان أوصل لموقعك وأقترح عليك أقرب الأماكن 📍',
          type: LocationErrorType.permissionDenied,
        );
      }
    }

    if (permission == LocationPermission.deniedForever) {
      throw LocationException(
        'رفضت إذن الموقع نهائياً. فعّله من إعدادات التطبيق عشان أقدر أساعدك.',
        type: LocationErrorType.permissionDeniedForever,
      );
    }

    // بلا حد زمني كان الطلب يعلّق للأبد داخل مبنى أو بإشارة ضعيفة، و«ريكو
    // يدوّر لك الحين…» ما يتغيّر. بعد ١٠ ثواني نرضى بآخر موقع معروف للجهاز.
    try {
      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );
    } on TimeoutException {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) return last;
      throw LocationException('ما قدرت أحدد موقعك الحين — الإشارة ضعيفة.');
    }
  }

  /// هل الموقع متاح الآن بلا أي نافذة إذن؟
  ///
  /// موجودة لأجل الاستخدامات الاختيارية مثل اقتراح الجو: تستدعي
  /// [Geolocator.checkPermission] التي تقرأ الحالة ولا تطلب شيئاً، بعكس
  /// [getCurrentLocation] التي تطلب الإذن عند الحاجة. نافذة إذن تظهر بسبب
  /// بطاقة جو — قبل أن يطلب المستخدم أي شيء — تُقرأ كتطفّل، والإذن يُطلب حين
  /// يبحث فعلاً فيكون سببه ظاهراً له.
  Future<bool> hasPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    final permission = await Geolocator.checkPermission();
    return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
  }

  double distanceInMeters(
      double startLat, double startLng, double endLat, double endLng) {
    return Geolocator.distanceBetween(startLat, startLng, endLat, endLng);
  }
}
