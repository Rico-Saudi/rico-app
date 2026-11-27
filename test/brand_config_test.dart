import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/brand.dart';
import 'package:rico_app/utils/money.dart';

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

  group('عملة السوق', () {
    test('الافتراضي بالريال السعودي', () {
      // كل نسخة ريكو مثبّتة عند الناس تبني بلا رايات، فلا يجوز أن تتغيّر
      // عملتها تحت أيديهم.
      expect(Brand.currency, 'ر.س');
      expect(priceLabel(12), '12 ر.س');
    });

    test('الرقم بلا كسور حين يكون صحيحاً، وبكسرين حين لا', () {
      // الكسور تُسقط فقط حين يكون الرقم صحيحاً تماماً — ما دون ذلك يُعرض
      // بكسرين، لأن إخفاء هللات من سعر يُغيّره.
      expect(money(10), '10');
      expect(money(10.0), '10');
      expect(money(10.5), '10.50');
      expect(money(7), '7');
    });

    test('كل سعر يُلحق بعملة السوق الحالي، لا بثابت مكتوب', () {
      // هذا التوكيد يصحّ تحت أي راية بناء، فهو يغطّي النسخة الأردنية أيضاً:
      // لو عاد أحدٌ يكتب «ر.س» داخل priceLabel، يسقط هنا في بناء «تدلل».
      expect(priceLabel(12), endsWith(Brand.currency));
      expect(priceLabel(12), '${money(12)} ${Brand.currency}');
      expect(Brand.currency, isNotEmpty);
      expect(Brand.currency.trim(), Brand.currency);
    });

  });
}
