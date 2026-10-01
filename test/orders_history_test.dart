import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/customer_order.dart';
import 'package:rico_app/screens/order_details_screen.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/utils/arabic_dates.dart';

/// سجلّ الطلبات: قراءة ردّ الخادم، وصياغة تواريخه، وما تعرضه شاشة التفاصيل.
void main() {
  Map<String, dynamic> apiOrder({
    List<Map<String, dynamic>>? items,
    String status = 'new',
    num total = 30,
    String? createdAt,
    String? phone,
  }) =>
      {
        'id': '6aae9f4ee4a1f23bc0bb8ea2',
        'businessId': 'b1',
        'businessName': 'مطعم الماهر',
        'businessPhone': phone,
        'items': items ??
            [
              {
                'itemType': 'product',
                'itemId': 'p1',
                'label': 'شاورما لحم عربي',
                'detail': '18 ر.س',
                'quantity': 2,
                'unitPrice': 15,
                'imageUrl': '/products/images/abc',
              },
            ],
        'total': total,
        'status': status,
        'createdAt': createdAt ?? '2026-09-19T11:30:00.000Z',
      };

  group('قراءة الطلب', () {
    test('يضمّ رابط صورة الصنف لأصل الخادم', () {
      final order = CustomerOrder.fromJson(apiOrder(), baseUrl: 'https://app.rico-go.com');
      expect(order.lines.first.imageUrl, 'https://app.rico-go.com/products/images/abc');
    });

    test('يجمع القطع لا الأسطر', () {
      final order = CustomerOrder.fromJson(
        apiOrder(items: [
          {'itemType': 'product', 'label': 'شاي', 'quantity': 3, 'unitPrice': 10},
          {'itemType': 'product', 'label': 'تمر', 'quantity': 2, 'unitPrice': 25},
        ]),
      );
      expect(order.lines.length, 2);
      expect(order.itemCount, 5);
    });

    test('يترجم الحالة لصيغة العميل', () {
      expect(CustomerOrder.fromJson(apiOrder()).status, OrderStatus.pending);
      expect(CustomerOrder.fromJson(apiOrder(status: 'handled')).status, OrderStatus.handled);
    });

    test('يرصد العرض بلا سعر حتى لا يبدو الإجمالي نهائياً', () {
      final order = CustomerOrder.fromJson(
        apiOrder(items: [
          {'itemType': 'deal', 'label': 'اشتري واحد والثاني مجاناً', 'quantity': 1, 'unitPrice': null},
        ], total: 0),
      );
      expect(order.hasUnpricedLine, isTrue);
      expect(order.lines.first.isDeal, isTrue);
    });

    test('المرجع آخر ست خانات من المعرّف', () {
      expect(CustomerOrder.fromJson(apiOrder()).reference, 'BB8EA2');
    });

    test('طلب بلا أصناف لا يُسقط الطلب', () {
      final order = CustomerOrder.fromJson(apiOrder(items: []));
      expect(order.lines, isEmpty);
      expect(order.itemCount, 0);
    });
  });

  group('صياغة التاريخ', () {
    final now = DateTime(2026, 9, 19, 15, 0);

    test('يفرّق اليوم عن أمس تقويمياً لا بفارق الساعات', () {
      // ١١ مساءً أمس عمره ١٦ ساعة فقط، ومع ذلك «أمس».
      expect(ArabicDates.groupLabel(DateTime(2026, 9, 18, 23, 0), now: now), 'أمس');
      expect(ArabicDates.groupLabel(DateTime(2026, 9, 19, 0, 30), now: now), 'اليوم');
    });

    test('يجمع ما هو أبعد في نطاقات أوسع', () {
      expect(ArabicDates.groupLabel(DateTime(2026, 9, 15), now: now), 'هذا الأسبوع');
      expect(ArabicDates.groupLabel(DateTime(2026, 9, 1), now: now), 'هذا الشهر');
      expect(ArabicDates.groupLabel(DateTime(2026, 5, 1), now: now), 'أقدم');
    });

    test('الوقت بلاحقة عربية', () {
      expect(ArabicDates.time(DateTime(2026, 9, 19, 15, 5)), '3:05 م');
      expect(ArabicDates.time(DateTime(2026, 9, 19, 0, 5)), '12:05 ص');
    });
  });

  group('شاشة التفاصيل', () {
    Future<void> pumpDetails(WidgetTester tester, CustomerOrder order) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          locale: const Locale('ar', 'SA'),
          home: OrderDetailsScreen(order: order),
        ),
      );
      await tester.pump();
    }

    testWidgets('تعرض حساب كل سطر ومجموعه والإجمالي', (tester) async {
      await pumpDetails(
        tester,
        CustomerOrder.fromJson(apiOrder(items: [
          {'itemType': 'product', 'label': 'شاورما', 'quantity': 2, 'unitPrice': 15},
          {'itemType': 'product', 'label': 'بيبسي', 'quantity': 1, 'unitPrice': 5},
        ], total: 35)),
      );

      // الحساب مكتوب صراحة، فيقدر العميل يراجعه لا أن يصدّق المجموع وحده.
      expect(find.text('15 ر.س × 2'), findsOneWidget);
      expect(find.text('30 ر.س'), findsOneWidget);
      expect(find.text('×2'), findsOneWidget);
      expect(find.text('الإجمالي'), findsOneWidget);
      expect(find.text('35 ر.س'), findsOneWidget);
      expect(find.text('3 قطع'), findsOneWidget);
    });

    testWidgets('تشرح الحالة بجملة لا بوسم وحده', (tester) async {
      await pumpDetails(tester, CustomerOrder.fromJson(apiOrder()));
      expect(find.text('بانتظار المحل'), findsOneWidget);
      expect(find.textContaining('ينتظر ردّهم'), findsOneWidget);

      await pumpDetails(tester, CustomerOrder.fromJson(apiOrder(status: 'handled')));
      expect(find.text('تواصل معك'), findsOneWidget);
    });

    testWidgets('زر الاتصال يظهر فقط حين يكون للمحل رقم', (tester) async {
      await pumpDetails(tester, CustomerOrder.fromJson(apiOrder()));
      expect(find.text('اتصل بالمحل'), findsNothing);

      await pumpDetails(tester, CustomerOrder.fromJson(apiOrder(phone: '+966512345678')));
      expect(find.text('اتصل بالمحل'), findsOneWidget);
    });

    testWidgets('تنبّه أن العروض خارج الإجمالي', (tester) async {
      await pumpDetails(
        tester,
        CustomerOrder.fromJson(apiOrder(items: [
          {'itemType': 'deal', 'label': 'اشتري واحد والثاني مجاناً', 'detail': 'عرض', 'quantity': 1},
        ], total: 0)),
      );
      expect(find.text('قيمة العروض يحسبها المحل عند التواصل.'), findsOneWidget);
    });

    testWidgets('رقم الطلب معروض ليُقرأ للمحل', (tester) async {
      await pumpDetails(tester, CustomerOrder.fromJson(apiOrder()));
      expect(find.text('#BB8EA2'), findsOneWidget);
    });
  });
}
