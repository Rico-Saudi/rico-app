import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/business_catalog.dart';
import 'package:rico_app/models/chat_message.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/message_bubble.dart';
import 'package:rico_app/widgets/order_shop_options_card.dart';

/// "وصّلي وجبتين شاورما" بلا اسم محل: ريكو ما يختار عن العميل — يعرض عليه
/// المحلات ومعها وش عند كل واحد من طلبه، ويقرر هو.
void main() {
  OrderShopOption option(
    String name, {
    int? distance = 500,
    List<String> has = const [],
    List<String> missing = const [],
  }) =>
      OrderShopOption(id: name, name: name, distanceMeters: distance, has: has, missing: missing);

  Future<void> pumpCard(
    WidgetTester tester,
    List<OrderShopOption> options, {
    void Function(OrderShopOption)? onPick,
    String? busyShopId,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ar', 'SA'),
        home: Scaffold(
          body: SingleChildScrollView(
            child: OrderShopOptionsCard(options: options, onPick: onPick, busyShopId: busyShopId),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  group('بطاقة اختيار المحل', () {
    testWidgets('تعرض المحلات بترتيبها ومسافاتها', (tester) async {
      await pumpCard(tester, [
        option('مطعم الشام', distance: 1500, has: ['شاورما']),
        option('مطعم البيتزا', distance: 400, missing: ['شاورما']),
      ]);

      expect(find.text('1. مطعم الشام'), findsOneWidget);
      expect(find.text('2. مطعم البيتزا'), findsOneWidget);
      expect(find.text('1.5 كم'), findsOneWidget);
      expect(find.text('400 م'), findsOneWidget);
    });

    // بيت القصيد: العميل يقرر بلا ما يفتح المحلات وحدة وحدة.
    testWidgets('تقول وش عند كل محل من طلبه ووش ناقص', (tester) async {
      await pumpCard(tester, [
        option('مطعم الكل', has: ['شاورما', 'بطاطس']),
        option('مطعم الشاورما', has: ['شاورما'], missing: ['بطاطس']),
      ]);

      expect(find.text('شاورما'), findsNWidgets(2));
      expect(find.text('بطاطس'), findsOneWidget);
      expect(find.text('ما فيه بطاطس'), findsOneWidget);
    });

    testWidgets('المحل اللي ما عنده شي يدعوه لتصفّح القائمة لا للطلب', (tester) async {
      await pumpCard(tester, [
        option('مطعم الكل', has: ['شاورما']),
        option('مطعم البيتزا', missing: ['شاورما']),
      ]);

      expect(find.text('اطلب من هنا'), findsOneWidget);
      expect(find.text('شوف قائمتهم'), findsOneWidget);
    });

    // طلب عام ("وجبة") ما فيه وش نقارن عليه، وادّعاء توفّر أو نقص اختراع.
    testWidgets('الطلب العام ما يدّعي توفّراً ولا نقصاً', (tester) async {
      await pumpCard(tester, [option('مطعم قريب')]);
      expect(find.text('قائمتهم جاهزة تختار منها'), findsOneWidget);
    });

    testWidgets('الضغط يمرّر المحل المختار', (tester) async {
      OrderShopOption? picked;
      await pumpCard(
        tester,
        [option('مطعم الشام', has: ['شاورما']), option('مطعم البيتزا')],
        onPick: (o) => picked = o,
      );

      await tester.tap(find.text('اطلب من هنا'));
      expect(picked?.name, 'مطعم الشام');
    });

    // ضغطتان على محلين = طلبان متوازيان من محلين، وهذا ما قصده أحد.
    testWidgets('أثناء التجهيز تتعطّل بقية المحلات', (tester) async {
      var taps = 0;
      await pumpCard(
        tester,
        [option('مطعم الشام', has: ['شاورما']), option('مطعم البيتزا', has: ['شاورما'])],
        onPick: (_) => taps++,
        busyShopId: 'مطعم الشام',
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.tap(find.text('اطلب من هنا'));
      expect(taps, 0);
    });
  });

  group('الفقاعة', () {
    testWidgets('تعرض المحلات المقترحة داخل رسالة ريكو', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          locale: const Locale('ar', 'SA'),
          home: Scaffold(
            body: SingleChildScrollView(
              child: MessageBubble(
                message: ChatMessage(
                  text: 'لقيت لك مطاعم عندها طلبك — اختر من وين تطلب 👇',
                  sender: MessageSender.bot,
                  shopOptions: [option('مطعم الشام', has: ['شاورما'])],
                  onPickShop: (_) {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(OrderShopOptionsCard), findsOneWidget);
      expect(find.text('1. مطعم الشام'), findsOneWidget);
    });
  });
}
