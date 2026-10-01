import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:rico_app/screens/chat_screen.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// المحادثة كاملة عبر الشاشة نفسها: "وش المطاعم القريبة؟" ثم "أبغى أطلب من
/// الثاني". الخادم وهمي، والمهم هو اللي يطلع من التطبيق فعلاً — أي محل
/// انطلب منه، وبأي معرّف.
void main() {
  const maher = '64b000000000000000000002';
  const reem = '64b000000000000000000003';

  final places = [
    // نتيجة Google احتياطية — ما لها قائمة عندنا، فما ينطلب منها.
    {'id': 'ChIJgoogle1', 'name': 'مطعم القدس', 'lat': 31.95, 'lng': 35.91, 'source': 'google', 'distanceMeters': 120},
    {'id': maher, 'nameAr': 'مطعم الماهر', 'lat': 31.95, 'lng': 35.91, 'source': 'rico', 'distanceMeters': 300},
    {'id': reem, 'nameAr': 'شاورما الريم', 'lat': 31.95, 'lng': 35.91, 'source': 'rico', 'distanceMeters': 450},
  ];

  late List<Map<String, dynamic>> classifyBodies;
  late List<Map<String, dynamic>> resolveBodies;

  /// رد المصنّف لكل رسالة — يُضبط داخل كل اختبار.
  late Map<String, Map<String, dynamic>> classifierReplies;

  Map<String, dynamic> intents(List<Map<String, dynamic>> list) =>
      {'offTopic': false, 'reply': null, 'mood': 'neutral', 'intents': list};

  final restaurantsReply = intents([
    {'kind': 'place', 'category': 'restaurant', 'rank': 'nearest'}
  ]);

  Map<String, dynamic> order({int? position, String? placeName, List<List<Object>> items = const []}) => intents([
        {
          'kind': 'order',
          'referencedPosition': position,
          'placeName': placeName,
          'orderItems': [
            for (final i in items) {'name': i[0], 'quantity': i[1]}
          ],
        }
      ]);

  Future<http.Response> server(http.Request request) async {
    final path = request.url.path;
    if (path == '/classify') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      classifyBodies.add(body);
      final reply = classifierReplies[body['message']];
      if (reply == null) return http.Response('{}', 500);
      return http.Response.bytes(utf8.encode(jsonEncode(reply)), 200);
    }
    if (path == '/search') {
      return http.Response.bytes(utf8.encode(jsonEncode({'places': places})), 200);
    }
    if (path == '/orders/resolve') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      resolveBodies.add(body);
      final id = body['businessId'] as String? ?? 'byname';
      final name = id == maher ? 'مطعم الماهر' : id == reem ? 'شاورما الريم' : (body['placeName'] as String? ?? '');
      final items = (body['items'] as List).cast<Map<String, dynamic>>();
      return http.Response.bytes(
        utf8.encode(jsonEncode({
          'business': {'id': id, 'name': name},
          'catalog': {
            'businessId': id,
            'businessName': name,
            'products': [
              {'id': 'p1', 'name': 'شاورما', 'price': 3, 'finalPrice': 3},
            ],
            'deals': [],
          },
          'matched': [
            for (final i in items)
              if (i['name'] == 'شاورما')
                {'itemType': 'product', 'itemId': 'p1', 'label': 'شاورما', 'unitPrice': 3, 'quantity': i['quantity'], 'requestedAs': 'شاورما'}
          ],
          'unmatched': [],
          'suggestions': [],
          'shopOptions': [],
        })),
        200,
      );
    }
    // compose/weather/impressions/warmup: فشلها مقبول والشاشة تكمل بنصوصها.
    return http.Response('', 404);
  }

  setUp(() {
    classifyBodies = [];
    resolveBodies = [];
    classifierReplies = {'وش المطاعم القريبة؟': restaurantsReply};
    SharedPreferences.setMockInitialValues({});
    GeolocatorPlatform.instance = _FakeGeolocator();
  });

  Future<void> pumpChat(WidgetTester tester) async {
    // شاشة طويلة: القائمة تبني الظاهر بس، والرد الأخير لازم يكون ظاهراً
    // عشان نقرأ نصه.
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
    await tester.tap(find.byIcon(Icons.send_rounded));
    // بلا pumpAndSettle: نقاط الكتابة متحركة بلا نهاية.
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> run(WidgetTester tester, Future<void> Function() body) =>
      http.runWithClient(body, () => MockClient(server));

  testWidgets('"أبغى أطلب من الثاني" يطلب من المحل الثاني بمعرّفه', (tester) async {
    classifierReplies['أبغى أطلب من الثاني'] = order(position: 2, placeName: 'مطعم الماهر');
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'وش المطاعم القريبة؟');
      await say(tester, 'أبغى أطلب من الثاني');
    });
    await tester.pump();

    // المصنّف وصله السياق: القائمة نفسها بترتيبها.
    final context = classifyBodies.last['lastResults'] as Map<String, dynamic>;
    expect((context['items'] as List).map((i) => i['name']), ['مطعم القدس', 'مطعم الماهر', 'شاورما الريم']);
    expect((classifyBodies.last['history'] as List).first['content'], 'وش المطاعم القريبة؟');

    expect(resolveBodies, hasLength(1));
    expect(resolveBodies.single['businessId'], maher);
    expect(resolveBodies.single.containsKey('placeName'), isFalse);
    expect(find.textContaining('قائمة مطعم الماهر'), findsOneWidget);
  });

  testWidgets('اسم محل من القائمة بلا رقم — يطلب منه بمعرّفه لا باسمه', (tester) async {
    // المصنّف نسي الرقم ونقل الاسم بس: القائمة تكفي لتحديده.
    classifierReplies['اطلب لي من مطعم الماهر شاورما'] = order(placeName: 'مطعم الماهر', items: [
      ['شاورما', 2]
    ]);
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'وش المطاعم القريبة؟');
      await say(tester, 'اطلب لي من مطعم الماهر شاورما');
    });
    await tester.pump();

    expect(resolveBodies.single['businessId'], maher);
    expect(resolveBodies.single['items'], [
      {'name': 'شاورما', 'quantity': 2}
    ]);
  });

  testWidgets('"منه" بعد اختيار محل واحد يطلب من نفس المحل', (tester) async {
    classifierReplies['الثالث'] = intents([
      {'kind': 'place', 'category': 'restaurant', 'rank': 'nearest', 'referencedPosition': 3}
    ]);
    classifierReplies['اطلب لي منه شاورما'] = order(position: 1, items: [
      ['شاورما', 1]
    ]);
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'وش المطاعم القريبة؟');
      await say(tester, 'الثالث');
      await say(tester, 'اطلب لي منه شاورما');
    });
    await tester.pump();

    // "الثالث" عرض المحل وحده، فصار هو "آخر نتائج" ورقمه ١.
    expect((classifyBodies.last['lastResults']['items'] as List).single['name'], 'شاورما الريم');
    expect(resolveBodies.single['businessId'], reem);
  });

  testWidgets('محل غير مسجّل عندنا: يقولها صراحة وما يرسل طلباً', (tester) async {
    classifierReplies['أبغى أطلب من الأول'] = order(position: 1, placeName: 'مطعم القدس');
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'وش المطاعم القريبة؟');
      await say(tester, 'أبغى أطلب من الأول');
    });
    await tester.pump();

    expect(resolveBodies, isEmpty);
    expect(find.textContaining('مطعم القدس مو مسجّل عندنا'), findsOneWidget);
  });

  testWidgets('رقم برّا القائمة: يسأل بدل ما يطلب من محل ما اختاره', (tester) async {
    classifierReplies['أبغى أطلب من الخامس'] = order(position: 5);
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'وش المطاعم القريبة؟');
      await say(tester, 'أبغى أطلب من الخامس');
    });
    await tester.pump();

    expect(resolveBodies, isEmpty);
    expect(find.textContaining('ما عرفت أي محل تقصد'), findsOneWidget);
  });

  testWidgets('محل باسمه وما هو بالقائمة: يرجع للبحث بالاسم كالعادة', (tester) async {
    classifierReplies['أبي أطلب من مطعم البيك'] = order(placeName: 'مطعم البيك');
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'وش المطاعم القريبة؟');
      await say(tester, 'أبي أطلب من مطعم البيك');
    });
    await tester.pump();

    expect(resolveBodies.single['placeName'], 'مطعم البيك');
    expect(resolveBodies.single.containsKey('businessId'), isFalse);
  });

  testWidgets('اسم محل بلا أي قائمة سابقة: نفس المسار القديم بالاسم', (tester) async {
    classifierReplies['اطلب لي من مطعم الماهر شاورما'] = order(placeName: 'مطعم الماهر', items: [
      ['شاورما', 1]
    ]);
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'اطلب لي من مطعم الماهر شاورما');
    });
    await tester.pump();

    expect(classifyBodies.single.containsKey('lastResults'), isFalse);
    expect(resolveBodies.single['placeName'], 'مطعم الماهر');
    expect(resolveBodies.single.containsKey('businessId'), isFalse);
  });

  testWidgets('"الثاني" وحدها ما زالت تعرض المحل بلا طلب', (tester) async {
    classifierReplies['الثاني'] = intents([
      {'kind': 'place', 'category': 'restaurant', 'rank': 'nearest', 'referencedPosition': 2}
    ]);
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'وش المطاعم القريبة؟');
      await say(tester, 'الثاني');
    });
    await tester.pump();

    expect(resolveBodies, isEmpty);
    expect(find.textContaining('رقم 2'), findsOneWidget);
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
