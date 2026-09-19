import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/business_catalog.dart';
import 'package:rico_app/models/cart.dart';
import 'package:rico_app/models/request_flow.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/catalog_flow_card.dart';

/// بطاقة المتجر داخل المحادثة: تُبنى بعرض الفقاعة لا بعرض الشاشة، وفيها شبكة
/// منتجات بارتفاع محسوب — فالفيض (overflow) هنا احتمال حقيقي يستاهل اختباراً،
/// مثله مثل سلوك السلّة نفسه.
void main() {
  CatalogProduct product(String id, String name, {double price = 10, double? finalPrice, String? category}) =>
      CatalogProduct(
        id: id,
        name: name,
        price: price,
        finalPrice: finalPrice ?? price,
        category: category,
      );

  BusinessCatalog catalogOf(List<CatalogProduct> products, {List<CatalogDeal> deals = const []}) => BusinessCatalog(
        businessId: 'b1',
        businessName: 'بقالة الاختبار',
        products: products,
        deals: deals,
      );

  /// يُبنى داخل عرض ضيّق كعرض فقاعة الدردشة الحقيقية (٩٠٪ من شاشة ضيقة).
  Future<void> pumpCard(
    WidgetTester tester,
    RequestFlow flow, {
    CatalogFlowActions actions = const CatalogFlowActions(),
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ar', 'SA'),
        home: Scaffold(
          body: SingleChildScrollView(
            child: SizedBox(
              width: 340,
              child: CatalogFlowCard(flow: flow, actions: actions),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('تعرض المنتجات بأسعارها وتقتطع الزائد خلف زر "عرض الكل"', (tester) async {
    final products = [for (var i = 1; i <= 9; i++) product('p$i', 'منتج $i', price: i.toDouble())];
    var toggled = false;
    await pumpCard(
      tester,
      RequestFlow(catalog: catalogOf(products)),
      actions: CatalogFlowActions(onToggleShowAll: () => toggled = true),
    );

    expect(find.text('منتج 1'), findsOneWidget);
    expect(find.text('1 ر.س'), findsOneWidget);
    // ستة فقط تُعرض ابتداءً؛ الثلاثة الباقية خلف الزر.
    expect(find.text('منتج 7'), findsNothing);

    // البطاقة أطول من نافذة الاختبار، فالزر خارجها — بلا هذا التمرير تمرّ
    // الضغطة في الفراغ ويمرّ الاختبار بلا أن يختبر شيئاً.
    final button = find.text('عرض كل المنتجات (3 أكثر)');
    await tester.ensureVisible(button);
    await tester.pump();
    await tester.tap(button);
    expect(toggled, isTrue);
  });

  testWidgets('بعد التوسيع تظهر كل المنتجات', (tester) async {
    final products = [for (var i = 1; i <= 9; i++) product('p$i', 'منتج $i')];
    await pumpCard(tester, RequestFlow(catalog: catalogOf(products), showAllProducts: true));

    expect(find.text('منتج 9'), findsOneWidget);
    expect(find.text('عرض أقل'), findsOneWidget);
  });

  testWidgets('زر الإضافة يستدعي onAddProduct بالمنتج المضغوط', (tester) async {
    CatalogProduct? added;
    await pumpCard(
      tester,
      RequestFlow(catalog: catalogOf([product('p1', 'شاي'), product('p2', 'تمر')])),
      actions: CatalogFlowActions(onAddProduct: (p) => added = p),
    );

    // المنتج الثاني في الشبكة — يثبت أن الضغطة تحمل معها منتجها لا أول منتج.
    await tester.tap(find.text('أضف').at(1));
    expect(added?.id, 'p2');
  });

  testWidgets('المنتج الذي في السلّة يعرض عدّاداً بدل زر الإضافة', (tester) async {
    final tea = product('p1', 'شاي');
    final flow = RequestFlow(
      catalog: catalogOf([tea, product('p2', 'تمر')]),
      cart: const Cart().add(CartLine.fromProduct(tea)).add(CartLine.fromProduct(tea)),
    );
    await pumpCard(tester, flow);

    // سطر واحد بكمية ٢، لا سطران.
    expect(flow.cart.lines.length, 1);
    expect(find.text('2'), findsOneWidget);
    // المنتج الآخر ما زال يعرض زر الإضافة.
    expect(find.text('أضف'), findsOneWidget);
  });

  testWidgets('شريط السلّة يجمع القطع والإجمالي ويظهر فقط حين تمتلئ', (tester) async {
    final tea = product('p1', 'شاي', price: 12, finalPrice: 10);
    final dates = product('p2', 'تمر', price: 25);

    await pumpCard(tester, RequestFlow(catalog: catalogOf([tea, dates])));
    expect(find.text('مراجعة الطلب'), findsNothing);

    await pumpCard(
      tester,
      RequestFlow(
        catalog: catalogOf([tea, dates]),
        cart: const Cart()
            .add(CartLine.fromProduct(tea).withQuantity(3))
            .add(CartLine.fromProduct(dates).withQuantity(2)),
      ),
    );

    expect(find.text('مراجعة الطلب'), findsOneWidget);
    expect(find.text('5 قطع'), findsOneWidget);
    // ٣×١٠ + ٢×٢٥ = ٨٠، محسوبة من السعر بعد الخصم.
    expect(find.text('80 ر.س'), findsOneWidget);
  });

  testWidgets('المراجعة تسرد كل سطر بمجموعه ثم الإجمالي', (tester) async {
    final tea = product('p1', 'شاي', price: 12, finalPrice: 10);
    final dates = product('p2', 'تمر', price: 25);
    await pumpCard(
      tester,
      RequestFlow(
        catalog: catalogOf([tea, dates]),
        cart: const Cart().add(CartLine.fromProduct(tea).withQuantity(3)).add(CartLine.fromProduct(dates)),
        stage: RequestFlowStage.confirming,
      ),
    );

    // مجموع السطر لا سعر الوحدة: ٣×١٠ يُكتب ٣٠، لا ١٠.
    expect(find.text('30 ر.س'), findsOneWidget);
    expect(find.text('25 ر.س'), findsOneWidget);
    expect(find.text('الإجمالي'), findsOneWidget);
    expect(find.text('55 ر.س'), findsOneWidget);
    expect(find.text('أضف غيره'), findsOneWidget);
  });

  testWidgets('العرض بلا سعر لا يُحتسب ويُقال ذلك صراحة', (tester) async {
    final deal = CatalogDeal(id: 'd1', titleAr: 'اشتري واحد والثاني مجاناً', dealType: 'bogo');
    await pumpCard(
      tester,
      RequestFlow(
        catalog: catalogOf([product('p1', 'شاي')], deals: [deal]),
        cart: const Cart().add(CartLine.fromDeal(deal)),
        stage: RequestFlowStage.confirming,
      ),
    );

    expect(find.text('قيمة العروض يحسبها المحل عند التواصل.'), findsOneWidget);
    expect(find.text('0 ر.س'), findsOneWidget);
  });

  testWidgets('مرشِّح الفئات يظهر عند تعددها ويفلتر المعروض', (tester) async {
    final products = [
      product('p1', 'شاي', category: 'مشروبات'),
      product('p2', 'قهوة', category: 'مشروبات'),
      product('p3', 'تمر', category: 'حلويات'),
    ];

    await pumpCard(tester, RequestFlow(catalog: catalogOf(products)));
    expect(find.text('الكل'), findsOneWidget);

    await pumpCard(tester, RequestFlow(catalog: catalogOf(products), activeCategory: 'حلويات'));
    expect(find.text('تمر'), findsOneWidget);
    expect(find.text('شاي'), findsNothing);
  });

  testWidgets('فئة واحدة لا تستحق صفّ مرشِّحات', (tester) async {
    await pumpCard(
      tester,
      RequestFlow(catalog: catalogOf([product('p1', 'شاي', category: 'مشروبات')])),
    );
    expect(find.text('الكل'), findsNothing);
  });
}
