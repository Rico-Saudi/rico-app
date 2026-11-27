import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/brand.dart';

void main() {
  group('إعداد النسخة الإقليمية', () {
    test('الافتراضي هو نسخة السعودية على خادمها', () {
      // بلا رايات بناء: النسخة السعودية، وهي ما يبنيه أي أحد بلا نية أخرى.
      expect(Brand.slug, 'rico');
      expect(Brand.apiBaseUrl, 'https://app.rico-go.com');
    });

    test('العنوان جذر مطلق بلا خط مائل في النهاية', () {
      // كل خدمة تركّب مسارها بـ '$apiBaseUrl/<path>'، فخط مائل زائد هنا يصير
      // '//classify' في كل نداء — يصحّ أحياناً ويفشل أحياناً حسب الوسيط.
      expect(Brand.apiBaseUrl, isNot(endsWith('/')));
      final uri = Uri.parse(Brand.apiBaseUrl);
      expect(uri.hasScheme, isTrue);
      expect(uri.host, isNotEmpty);
      expect(uri.path, isEmpty);
    });

    test('السلوق غير فارغ — الخادم يردّ باسمه ولهجته', () {
      expect(Brand.slug, isNotEmpty);
      expect(Brand.slug.trim(), Brand.slug);
    });
  });
}
