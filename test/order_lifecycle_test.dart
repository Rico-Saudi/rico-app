import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/business_catalog.dart';
import 'package:rico_app/models/cart.dart';
import 'package:rico_app/models/customer_order.dart';
import 'package:rico_app/models/request_flow.dart';
import 'package:rico_app/screens/order_details_screen.dart';
import 'package:rico_app/services/order_watcher.dart';
import 'package:rico_app/theme/app_theme.dart';

/// ما بعد «أكّد»: متابعة رد المحل، الإلغاء، إعادة الطلب، والمحل الموقف.
void main() {
  CustomerOrder order({String stage = 'new', String? cancelledBy, String? note}) => CustomerOrder.fromJson({
        'id': '6aae9f4ee4a1f23bc0bb8ea2',
        'businessName': 'مطعم الماهر',
        'businessPhone': '0500000000',
        'items': [
          {'itemType': 'product', 'label': 'شاورما', 'quantity': 2, 'unitPrice': 15},
          {'itemType': 'product', 'label': 'بيبسي', 'quantity': 1, 'unitPrice': 3},
        ],
        'total': 33,
        'stage': stage,
        'cancelledBy': cancelledBy,
        'vendorNote': note,
        'createdAt': '2026-10-12T11:30:00.000Z',
      });

  group('حالة الطلب', () {
    test('يُلغى بس وهو بانتظار المحل', () {
      expect(order().canCancel, isTrue);
      expect(order(stage: 'confirmed').canCancel, isFalse);
    });

    test('المفتوح يستاهل المتابعة والمنتهي لا', () {
      expect(order(stage: 'ready').isOpen, isTrue);
      expect(order(stage: 'completed').isOpen, isFalse);
      expect(order(stage: 'cancelled', cancelledBy: 'timeout').isOpen, isFalse);
    });

    test('يعرف من ألغاه', () {
      expect(order(stage: 'cancelled', cancelledBy: 'timeout').cancelledBy, CancelledBy.timeout);
      expect(order(stage: 'cancelled').cancelledBy, isNull);
    });
  });

  group('سطر المحادثة لما يتغيّر الطلب', () {
    test('يقول إن المحل أكّد أو جهّز', () {
      expect(OrderWatcher.describe(order(stage: 'confirmed')), contains('أكّد طلبك'));
      expect(OrderWatcher.describe(order(stage: 'ready')), contains('جاهز'));
    });

    test('يفرّق بين اعتذار المحل وانتهاء المهلة', () {
      expect(OrderWatcher.describe(order(stage: 'cancelled', cancelledBy: 'shop', note: 'خلص اللحم')), contains('«خلص اللحم»'));
      expect(OrderWatcher.describe(order(stage: 'cancelled', cancelledBy: 'timeout')), contains('ما رد'));
    });

    test('يسكت عن إلغاء العميل نفسه وعن الاكتمال', () {
      expect(OrderWatcher.describe(order(stage: 'cancelled', cancelledBy: 'customer')), isNull);
      expect(OrderWatcher.describe(order(stage: 'completed')), isNull);
    });
  });

  group('إعادة الطلب', () {
    test('نفس الأصناف بكمياتها من نفس المحل', () {
      expect(order().reorderText, 'اطلب لي من مطعم الماهر 2 شاورما، 1 بيبسي');
    });

    test('من محل ثاني: الأصناف بلا اسم المحل', () {
      expect(OrderWatcher.elsewhereText(order()), 'اطلب لي 2 شاورما، 1 بيبسي');
    });
  });

  group('معرّف محاولة الإرسال', () {
    final catalog = BusinessCatalog(businessId: 'b1', businessName: 'ريكو مارت', products: const [], deals: const []);
    const line = CartLine(itemType: 'product', itemId: 'p1', label: 'شاي');

    test('يبقى نفسه مع تغيّر المرحلة، فإعادة «أكّد» ما تكرر الطلب', () {
      final flow = RequestFlow(catalog: catalog, cart: const Cart(lines: [line]));
      expect(flow.copyWith(stage: RequestFlowStage.submitting).clientRef, flow.clientRef);
    });

    test('يتجدد لما تتغيّر السلّة', () {
      final flow = RequestFlow(catalog: catalog, cart: const Cart(lines: [line]));
      expect(flow.copyWith(cart: const Cart()).clientRef, isNot(flow.clientRef));
    });
  });

  group('المحل الموقف', () {
    BusinessCatalog parse(Map<String, dynamic>? pause) => BusinessCatalog.fromJson({
          'businessId': 'b1',
          'businessName': 'ريكو مارت',
          'ordersPause': pause,
          'products': [],
          'deals': [],
        });

    test('يُقرأ من القائمة قبل ما تنبني السلّة', () {
      final now = DateTime.utc(2026, 10, 12, 10);
      expect(parse(null).isPausedAt(now), isFalse);
      expect(parse({'until': null, 'note': 'جرد'}).isPausedAt(now), isTrue);
      expect(parse({'until': '2026-10-12T09:00:00.000Z'}).isPausedAt(now), isFalse);
      expect(parse({'until': null, 'note': 'جرد'}).pausedMessage(), contains('«جرد»'));
    });
  });

  testWidgets('زر الإلغاء يظهر للطلب المنتظر وزر الإعادة للمنتهي', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: OrderDetailsScreen(order: order())));
    expect(find.text('ألغِ الطلب'), findsOneWidget);
    expect(find.text('اطلب نفسه مرة ثانية'), findsNothing);

    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light(), home: OrderDetailsScreen(order: order(stage: 'cancelled', cancelledBy: 'timeout'))),
    );
    await tester.pumpAndSettle();
    expect(find.text('ألغِ الطلب'), findsNothing);
    expect(find.text('اطلب نفسه مرة ثانية'), findsOneWidget);
    expect(find.textContaining('ما رد على طلبك بالوقت'), findsOneWidget);
  });
}
