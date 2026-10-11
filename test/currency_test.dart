import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/currency.dart';
import 'package:rico_app/models/business_catalog.dart';
import 'package:rico_app/models/deal.dart';

void main() {
  group('currencyLabel', () {
    test('يترجم رموز ISO إلى أسماء عربية', () {
      expect(currencyLabel('JOD'), 'دينار');
      expect(currencyLabel('SAR'), 'ريال');
    });

    test('العملة الغائبة تُقرأ كعملة هذا الإصدار', () {
      expect(currencyLabel(null), 'دينار');
      expect(currencyLabel(''), 'دينار');
    });

    test('العملة غير المعروفة ترجع كما هي بدل أن تختفي من السعر', () {
      expect(currencyLabel('EUR'), 'EUR');
    });
  });

  group('formatAmount', () {
    // الدينار ألف فلس: تقريب ٠٫٧٥ لأقرب دينار كان يعرض قهوة بـ«1 دينار».
    test('يحفظ الفلوس حتى ثلاث خانات بلا أصفار زائدة', () {
      expect(formatAmount(0.75), '0.75');
      expect(formatAmount(0.350), '0.35');
      expect(formatAmount(0.125), '0.125');
      expect(formatAmount(2.5), '2.5');
    });

    test('المبلغ الصحيح بلا كسور', () {
      expect(formatAmount(12), '12');
      expect(formatAmount(10.0), '10');
      expect(formatAmount(0), '0');
    });

    test('يمحو ضجيج الفاصلة العائمة', () {
      expect(formatAmount(0.1 + 0.2), '0.3');
      expect(formatPrice(1.1 * 3), '3.3 دينار');
    });
  });

  group('CatalogProduct', () {
    // الخطأ الأصلي: السعر كان يُصاغ بـ"دينار" مكتوبة يدوياً، فيظهر الريال
    // السعودي في إصدار الأردن مهما أرسل الخادم.
    test('يصوغ السعر بعملة السجل لا بعملة مكتوبة مسبقاً', () {
      final product = CatalogProduct.fromJson({
        'id': 'p1',
        'name': 'منسف',
        'price': 12,
        'finalPrice': 9,
        'currency': 'JOD',
      });
      expect(product.priceLabel, '9 دينار');
      expect(product.originalPriceLabel, '12');
      expect(product.hasDiscount, isTrue);
    });

    test('سجل قديم بلا حقل عملة يُقرأ كدينار، بكسوره لا مقرّباً', () {
      final product = CatalogProduct.fromJson({
        'id': 'p2',
        'name': 'شاورما',
        'price': 1.5,
        'finalPrice': 1.5,
      });
      expect(product.priceLabel, '1.5 دينار');
    });

    test('منتج سعودي في نفس قاعدة البيانات يحتفظ بريّاله', () {
      final product = CatalogProduct.fromJson({
        'id': 'p3',
        'name': 'كبسة',
        'price': 40,
        'finalPrice': 35,
        'currency': 'SAR',
      });
      expect(product.priceLabel, '35 ريال');
    });
  });

  group('typeLabel للعروض', () {
    test('خصم بمبلغ ثابت يحمل عملة العرض', () {
      final deal = CatalogDeal.fromJson({
        'id': 'd1',
        'titleAr': 'خصم الافتتاح',
        'dealType': 'fixed',
        'value': 5,
        'currency': 'JOD',
      });
      expect(deal.typeLabel, 'خصم 5 دينار');
    });

    test('العرض القادم من GET /deals يتبع نفس الصياغة', () {
      final deal = Deal(
        id: 'd2',
        placeId: 'b1',
        placeName: 'مطعم',
        titleAr: 'خصم',
        dealType: 'fixed',
        value: 3,
        source: 'partner',
      );
      expect(deal.typeLabel, 'خصم 3 دينار');
    });

    test('الخصم النسبي لا يذكر عملة أصلاً', () {
      final deal = CatalogDeal.fromJson({
        'id': 'd3',
        'titleAr': 'خصم',
        'dealType': 'percent',
        'value': 25,
      });
      expect(deal.typeLabel, 'خصم 25٪');
    });
  });
}
