import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/services/arabic_normalizer.dart';

void main() {
  group('normalizeArabic', () {
    test('يوحّد الهمزات والتاء المربوطة والألف المقصورة', () {
      expect(normalizeArabic('أقرب صيدلية'), 'اقرب صيدليه');
      expect(normalizeArabic('إيش'), 'ايش');
      expect(normalizeArabic('تعبت من حياتى'), 'تعبت من حياتي');
      expect(normalizeArabic('رؤية'), 'رويه');
    });

    test('يرمي التشكيل والترقيم والإيموجي', () {
      expect(normalizeArabic('بدي موت؟؟؟'), 'بدي موت');
      expect(normalizeArabic('شُكْراً!! 🤍'), 'شكرا');
    });

    test('يطوي التطويل بالتكرار دون المضاعفة الصحيحة', () {
      expect(normalizeArabic('بدي أمووت'), 'بدي اموت');
      expect(normalizeArabic('جوووعان'), 'جوعان');
      expect(normalizeArabic('كهربائيين'), 'كهرباييين');
      expect(normalizeArabic('الله يعافيك'), 'الله يعافيك');
    });

    test('يحوّل الأرقام العربية ويوحّد المسافات', () {
      expect(normalizeArabic('  ٣  مطاعم   '), '3 مطاعم');
    });
  });
}
