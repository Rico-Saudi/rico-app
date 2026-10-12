import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:rico_app/screens/chat_screen.dart';
import 'package:rico_app/services/llm_intent_service.dart';
import 'package:rico_app/services/intent_service.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/chat_composer.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "بدي اشتري جبنة، قارن وين أرخص جبنة" عبر الشاشة نفسها: المقارنة تطلع
/// مرتّبة من الأرخص، و«اطلبه» يجهّز سلّة بالصنف نفسه من المحل اللي ضغطه.
void main() {
  const noor = '64b000000000000000000011';
  const reem = '64b000000000000000000012';

  late List<Map<String, dynamic>> compareBodies;
  late List<String> catalogFetches;
  late List<Map<String, dynamic>> offers;

  Map<String, dynamic> offer(String id, String shop, String product, num price, {num? finalPrice, String? unit, int meters = 800}) => {
        'businessId': id,
        'businessName': shop,
        'distanceMeters': meters,
        'productId': 'p-$id',
        'productName': product,
        'unit': unit,
        'price': price,
        'finalPrice': finalPrice ?? price,
        'imageUrl': null,
      };

  Future<http.Response> json(Object body) async => http.Response.bytes(utf8.encode(jsonEncode(body)), 200);

  Future<http.Response> server(http.Request request) async {
    final path = request.url.path;
    if (path == '/classify') {
      return json({
        'offTopic': false,
        'reply': null,
        'mood': 'neutral',
        'intents': [
          {
            'kind': 'compare',
            'orderItems': [
              {'name': 'جبنة', 'quantity': 1}
            ],
          }
        ],
      });
    }
    if (path == '/orders/compare') {
      compareBodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return json({
        'comparisons': [
          {'requested': 'جبنة', 'offers': offers}
        ],
      });
    }
    if (path.startsWith('/places/') && path.endsWith('/catalog')) {
      final id = path.split('/')[2];
      catalogFetches.add(id);
      final o = offers.firstWhere((o) => o['businessId'] == id);
      return json({
        'businessId': id,
        'businessName': o['businessName'],
        'products': [
          {'id': o['productId'], 'name': o['productName'], 'price': o['price'], 'finalPrice': o['finalPrice']},
          {'id': 'other', 'name': 'حليب', 'price': 6, 'finalPrice': 6},
        ],
        'deals': [],
      });
    }
    return http.Response('', 404);
  }

  setUp(() {
    compareBodies = [];
    catalogFetches = [];
    offers = [
      offer(noor, 'بقالة النور', 'جبنة مثلثات', 12, finalPrice: 7, unit: 'علبة', meters: 2400),
      offer(reem, 'بقالة الريم', 'جبنة بيضاء', 11, meters: 300),
    ];
    SharedPreferences.setMockInitialValues({});
    GeolocatorPlatform.instance = _FakeGeolocator();
  });

  Future<void> pumpChat(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1200, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      locale: const Locale('ar', 'SA'),
      supportedLocales: const [Locale('ar', 'SA')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const ChatScreen(),
    ));
    await tester.pump();
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> say(WidgetTester tester, String text) async {
    await tester.enterText(find.byType(TextField), text);
    await tester.pump();
    await tester.tap(find.descendant(of: find.byType(ChatComposer), matching: find.byIcon(Icons.send_rounded)));
    await settle(tester);
  }

  Future<void> run(WidgetTester tester, Future<void> Function() body) =>
      http.runWithClient(body, () => MockClient(server));

  test('the classifier\'s compare intent becomes a comparison, not an order', () {
    final intent = ResolvedIntent(
      kind: 'compare',
      orderItems: const [RequestedItem(name: 'جبنة')],
    ).toQueryIntent()!;
    expect(intent.kind, IntentKind.compare);
    expect(intent.label, 'جبنة');
    expect(ResolvedIntent(kind: 'compare').toQueryIntent(), isNull);
  });

  testWidgets('"قارن وين أرخص جبنة" يعرض المحلات من الأرخص ويقول الجواب', (tester) async {
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'بدي اشتري جبنة قارن وين ارخص جبنة');
    });
    await tester.pump();

    expect(compareBodies.single['items'], [
      {'name': 'جبنة'}
    ]);
    expect(compareBodies.single['lat'], 31.95);
    expect(compareBodies.single.containsKey('categorySlug'), isFalse);

    expect(find.textContaining('أرخص جبنة حولك عند بقالة النور بـ7 ر.س'), findsOneWidget);
    expect(find.text('الأرخص'), findsOneWidget);
    expect(find.text('جبنة مثلثات · علبة'), findsOneWidget);
    // السعر قبل الخصم مشطوب، والتوفير عن الأغلى محسوب.
    expect(find.text('12 ر.س'), findsOneWidget);
    expect(find.textContaining('توفّر 4 ر.س'), findsOneWidget);
    // الأرخص فوق ولو كان أبعد.
    final noorY = tester.getTopLeft(find.text('بقالة النور').last).dy;
    final reemY = tester.getTopLeft(find.text('بقالة الريم')).dy;
    expect(noorY, lessThan(reemY));
  });

  testWidgets('«اطلبه» يجهّز سلّة بالصنف نفسه من المحل اللي ضغطه', (tester) async {
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'قارن لي وين ارخص جبنة');
      // الثاني بالترتيب: يطلب من اللي اختاره، مو من الأرخص.
      await tester.tap(find.text('اطلبه').at(1));
      await settle(tester);
    });
    await tester.pump();

    expect(catalogFetches, [reem]);
    expect(find.textContaining('جهّزت لك جبنة بيضاء من بقالة الريم'), findsOneWidget);
    // المقارنة باقية فوق السلّة.
    expect(find.text('اطلبه'), findsNWidgets(2));
  });

  testWidgets('ولا محل عنده الصنف: يقولها ويدعوه يطلب بدل بطاقة فاضية', (tester) async {
    offers = [];
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'قارن لي وين ارخص جبنة');
    });
    await tester.pump();

    expect(find.textContaining('ما لقيت جبنة عند المحلات القريبة منك'), findsOneWidget);
    expect(find.text('اطلبه'), findsNothing);
  });
}

class _FakeGeolocator extends GeolocatorPlatform {
  @override
  Future<bool> isLocationServiceEnabled() async => true;

  @override
  Future<LocationPermission> checkPermission() async => LocationPermission.whileInUse;

  @override
  Future<LocationPermission> requestPermission() async => LocationPermission.whileInUse;

  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) async => Position(
        latitude: 31.95,
        longitude: 35.91,
        timestamp: DateTime(2026),
        accuracy: 5,
        altitude: 0,
        altitudeAccuracy: 0,
        heading: 0,
        headingAccuracy: 0,
        speed: 0,
        speedAccuracy: 0,
      );

  @override
  double distanceBetween(double startLatitude, double startLongitude, double endLatitude, double endLongitude) => 0;
}
