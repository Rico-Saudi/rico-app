import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:rico_app/screens/chat_screen.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/chat_composer.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// عروض وأسعار الإنترنت عبر الشاشة نفسها: قسم «من الإنترنت» تحت عروض ريكو
/// ومقارنته، يطلع لحاله لما ما عند ريكو شي، ويختفي بلا أثر لما يفشل.
void main() {
  late Map<String, dynamic> classifierReply;
  late List<Map<String, dynamic>> ricoDeals;
  late List<Map<String, dynamic>> localOffers;
  late http.Response Function() webDeals;
  late http.Response Function() webPrices;
  late List<Map<String, dynamic>> webBodies;

  http.Response json(Object body) => http.Response.bytes(utf8.encode(jsonEncode(body)), 200);

  Map<String, dynamic> intent(Map<String, dynamic> i) =>
      {'offTopic': false, 'reply': null, 'mood': 'neutral', 'intents': [i]};

  final webDealsBody = {
    'offers': [
      {
        'store': 'بنده',
        'headline': 'عروض نهاية الأسبوع على الخضار',
        'discount': 'حتى 50%',
        'validUntil': '15 أكتوبر',
        'url': 'https://panda.com.sa/offers',
        'source': 'panda.com.sa',
        'date': 'قبل يومين',
      },
    ],
  };

  final webPricesBody = {
    'comparisons': [
      {
        'requested': 'جبنة',
        'offers': [
          {'title': 'جبنة بيضاء كرافت', 'store': 'كارفور', 'price': 12.5, 'currency': 'SAR', 'url': 'https://carrefourksa.com/c', 'delivery': 'توصيل مجاني'},
          {'title': 'جبنة شيدر المراعي', 'store': 'نون', 'price': 18.95, 'currency': 'SAR', 'url': 'https://noon.com/a'},
        ],
      },
    ],
  };

  Future<http.Response> server(http.Request request) async {
    final path = request.url.path;
    if (path == '/classify') return json(classifierReply);
    if (path == '/deals') return json({'deals': ricoDeals});
    if (path == '/orders/compare') {
      return json({
        'comparisons': [
          {'requested': 'جبنة', 'offers': localOffers}
        ],
      });
    }
    if (path == '/web-offers/deals') {
      webBodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return webDeals();
    }
    if (path == '/web-offers/prices') {
      webBodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return webPrices();
    }
    return http.Response('', 404);
  }

  setUp(() {
    ricoDeals = [];
    localOffers = [];
    webBodies = [];
    webDeals = () => json(webDealsBody);
    webPrices = () => json(webPricesBody);
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

  Future<void> say(WidgetTester tester, String text) async {
    await tester.enterText(find.byType(TextField), text);
    await tester.pump();
    await tester.tap(find.descendant(of: find.byType(ChatComposer), matching: find.byIcon(Icons.send_rounded)));
    for (var i = 0; i < 30; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> run(WidgetTester tester, Future<void> Function() body) =>
      http.runWithClient(body, () => MockClient(server));

  group('وش العروض؟', () {
    setUp(() => classifierReply = intent({'kind': 'deals', 'label': 'العروض'}));

    testWidgets('عروض ريكو فوق، وعروض الإنترنت تحتها بعنوانها', (tester) async {
      ricoDeals = [
        {
          'id': 'd1',
          'placeId': 'b1',
          'placeName': 'مطعم الماهر',
          'titleAr': 'خصم على الكنافة',
          'dealType': 'percent',
          'value': 20,
          'source': 'vendor',
          'distanceMeters': 300,
        }
      ];
      await run(tester, () async {
        await pumpChat(tester);
        await say(tester, 'وش العروض؟');
      });
      await tester.pump();

      expect(webBodies.single, {'lat': 31.95, 'lng': 35.91, 'brand': 'rico', 'topic': 'العروض'});
      expect(find.text('مطعم الماهر'), findsWidgets);
      expect(find.text('عروض من الإنترنت'), findsOneWidget);
      expect(find.text('بنده'), findsOneWidget);
      expect(find.text('حتى 50%'), findsOneWidget);
      expect(find.text('لين 15 أكتوبر'), findsOneWidget);
      expect(find.text('panda.com.sa'), findsOneWidget);
      // ريكو أول.
      final ricoY = tester.getTopLeft(find.text('مطعم الماهر').first).dy;
      final webY = tester.getTopLeft(find.text('عروض من الإنترنت')).dy;
      expect(ricoY, lessThan(webY));
    });

    testWidgets('ولا عرض قريب عند ريكو: عروض الإنترنت لحالها، ويقولها صراحة', (tester) async {
      await run(tester, () async {
        await pumpChat(tester);
        await say(tester, 'وش العروض؟');
      });
      await tester.pump();

      expect(find.textContaining('بس لقيت لك هذي على الإنترنت'), findsOneWidget);
      expect(find.text('بنده'), findsOneWidget);
      expect(find.textContaining('ما لقيت عروض قريبة'), findsNothing);
    });

    testWidgets('الإنترنت فشل: عروض ريكو تطلع عادي بلا قسم فاضي', (tester) async {
      webDeals = () => http.Response('{"error":"x"}', 500);
      ricoDeals = [
        {'id': 'd1', 'placeId': 'b1', 'placeName': 'مطعم الماهر', 'titleAr': 'خصم', 'dealType': 'percent', 'value': 20, 'source': 'vendor'}
      ];
      await run(tester, () async {
        await pumpChat(tester);
        await say(tester, 'وش العروض؟');
      });
      await tester.pump();

      expect(find.text('مطعم الماهر'), findsWidgets);
      expect(find.text('عروض من الإنترنت'), findsNothing);
    });
  });

  group('قارن وين أرخص جبنة', () {
    setUp(() => classifierReply = intent({
          'kind': 'compare',
          'orderItems': [
            {'name': 'جبنة', 'quantity': 1}
          ],
        }));

    testWidgets('أسعار أونلاين تحت مقارنة المحلات القريبة', (tester) async {
      localOffers = [
        {
          'businessId': 'b1',
          'businessName': 'بقالة النور',
          'distanceMeters': 400,
          'productId': 'p1',
          'productName': 'جبنة بيضاء',
          'unit': 'علبة',
          'price': 14,
          'finalPrice': 14,
          'imageUrl': null,
        }
      ];
      await run(tester, () async {
        await pumpChat(tester);
        await say(tester, 'قارن وين ارخص جبنة');
      });
      await tester.pump();

      expect(webBodies.single['items'], [
        {'name': 'جبنة'}
      ]);
      expect(find.textContaining('عند بقالة النور بس، بـ14 ر.س'), findsOneWidget);
      expect(find.text('أسعاره أونلاين'), findsOneWidget);
      expect(find.text('12.50 ر.س'), findsOneWidget);
      expect(find.text('كارفور'), findsOneWidget);
      expect(find.text('توصيل مجاني'), findsOneWidget);
    });

    testWidgets('ولا محل قريب عنده: أرخص سعر أونلاين هو الجواب، ويقول إنه أونلاين', (tester) async {
      await run(tester, () async {
        await pumpChat(tester);
        await say(tester, 'قارن وين ارخص جبنة');
      });
      await tester.pump();

      expect(find.textContaining('أرخص سعر لقيته أونلاين عند كارفور بـ12.50 ر.س'), findsOneWidget);
      expect(find.text('اطلبه'), findsNothing);
    });
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
