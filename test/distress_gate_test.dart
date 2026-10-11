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

/// الشاشة نفسها مع خادم يرد 429 على كل شي — بالضبط الحالة اللي كانت توصّل
/// «ما فهمتك» لإنسان كتب "بدي موت؟". رد الحنية لازم يطلع بلا ما يُستدعى
/// الخادم أصلاً، والمبالغة ("بدي موت من الجوع") لازم تروح للخادم عادي.
void main() {
  late List<String> classifyMessages;

  Future<http.Response> server(http.Request request) async {
    if (request.url.path == '/classify') {
      classifyMessages.add((jsonDecode(request.body) as Map<String, dynamic>)['message'] as String);
      return http.Response('{"error":"upstream_error","status":429}', 502);
    }
    return http.Response('', 404);
  }

  setUp(() {
    classifyMessages = [];
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
    await tester.tap(find.byIcon(Icons.send_rounded));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> run(WidgetTester tester, Future<void> Function() body) =>
      http.runWithClient(body, () => MockClient(server));

  for (final text in ['بدي موت؟', 'ابي موت', 'تعبت من حياتى', 'بدي أمووت']) {
    testWidgets('"$text" يُجاب بحنية بلا نداء للخادم حتى لو الخادم ساقط', (tester) async {
      await run(tester, () async {
        await pumpChat(tester);
        await say(tester, text);
      });
      await tester.pump();

      expect(classifyMessages, isEmpty, reason: text);
      expect(find.textContaining('دكتور'), findsOneWidget, reason: text);
      expect(find.textContaining('ما ضبطت معي'), findsNothing, reason: text);
      expect(find.textContaining('ما فهمت عليك'), findsNothing, reason: text);
    });
  }

  testWidgets('"بدي موت من الجوع" جوع لا ضيق: يروح للخادم، وعند سقوطه يبحث عن مطعم محلياً', (tester) async {
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'بدي موت من الجوع');
    });
    await tester.pump();

    expect(classifyMessages, ['بدي موت من الجوع']);
    expect(find.textContaining('دكتور'), findsNothing);
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
