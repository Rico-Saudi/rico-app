import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/place_result.dart';

/// الخادم يرسل مسار الصورة نسبياً والتطبيق يضمّه لأصل الخادم — وهذا الضم هو
/// الفرق بين صورة تظهر وصورة تطلب عنواناً غير موجود، فيستاهل تثبيته باختبار.
void main() {
  Map<String, dynamic> apiPlace({String? photoUrl, String? attribution, String? category}) => {
        'id': 'abc123',
        'name': 'Test Cafe',
        'nameAr': 'كافيه الاختبار',
        'address': 'طريق الملك فهد',
        'lat': 24.7,
        'lng': 46.6,
        'distanceMeters': 320,
        'source': 'google',
        if (photoUrl != null) 'photoUrl': photoUrl,
        if (attribution != null) 'photoAttribution': attribution,
        if (category != null) 'categorySlug': category,
      };

  group('صورة نتيجة البحث', () {
    test('تُضمّ لأصل الخادم فيصير الرابط كاملاً', () {
      final place = PlaceResult.fromRicoApiJson(
        apiPlace(photoUrl: '/places/abc123/photo'),
        baseUrl: 'https://app.rico-go.com',
      );

      expect(place.photoUrl, 'https://app.rico-go.com/places/abc123/photo');
    });

    test('مكان بلا صورة يبقى بلا رابط، فترسم البطاقة رمز الفئة بدلها', () {
      final place = PlaceResult.fromRicoApiJson(apiPlace(), baseUrl: 'https://app.rico-go.com');

      expect(place.photoUrl, isNull);
      expect(place.photoAttribution, isNull);
    });

    test('اسم المصوّر وفئة المكان يوصلان كما أرسلهما الخادم', () {
      final place = PlaceResult.fromRicoApiJson(
        apiPlace(photoUrl: '/places/abc123/photo', attribution: 'Sara A.', category: 'cafe'),
        baseUrl: 'https://app.rico-go.com',
      );

      expect(place.photoAttribution, 'Sara A.');
      expect(place.categorySlug, 'cafe');
    });

    test('الرابط المضموم يبقى كاملاً بعد حفظه في المفضّلة واستعادته', () {
      final original = PlaceResult.fromRicoApiJson(
        apiPlace(photoUrl: '/places/abc123/photo', attribution: 'Sara A.', category: 'cafe'),
        baseUrl: 'https://app.rico-go.com',
      );

      // الدورة التي تمر بها كل نتيجة محفوظة: toJson عند الحفظ، fromJson عند
      // فتح شاشة المفضّلة. لو أعاد الضم هنا لصار الأصل مكرراً في الرابط.
      final restored = PlaceResult.fromJson(original.toJson());

      expect(restored.photoUrl, 'https://app.rico-go.com/places/abc123/photo');
      expect(restored.photoAttribution, 'Sara A.');
      expect(restored.categorySlug, 'cafe');
    });

    test('المسافة المحدّثة ما تُسقط بيانات الصورة', () {
      final place = PlaceResult.fromRicoApiJson(
        apiPlace(photoUrl: '/places/abc123/photo', attribution: 'Sara A.', category: 'cafe'),
        baseUrl: 'https://app.rico-go.com',
      ).copyWithDistance(880);

      expect(place.distanceMeters, 880);
      expect(place.photoUrl, 'https://app.rico-go.com/places/abc123/photo');
      expect(place.photoAttribution, 'Sara A.');
      expect(place.categorySlug, 'cafe');
    });
  });
}
