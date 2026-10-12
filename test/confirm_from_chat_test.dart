import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:rico_app/models/customer.dart';
import 'package:rico_app/screens/chat_screen.dart';
import 'package:rico_app/services/auth_service.dart';
import 'package:rico_app/services/auth_store.dart';
import 'package:rico_app/services/intent_service.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/chat_composer.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «أكّد الطلب» بالدردشة تؤكّد السلّة المفتوحة كأن المستخدم ضغط زر التأكيد —
/// بلا ما يرجع للبطاقة. والمهم هو اللي يوصل الخادم فعلاً: POST /requests
/// بنفس السلّة، وبلا نداء للمصنّف.
void main() {
  group('isConfirmCommand', () {
    for (final text in [
      'اكد الطلب',
      'أكّد الطلب',
      'أكد',
      'تمام أكده',
      'ايوه اكد الطلب لو سمحت',
      'يلا ريكو ثبت الطلب',
      'ارسل الطلب',
      'ابعثه',
      'تمام واكده',
      'تأكيد الطلب',
      'أكّد الطلب!!',
      'confirm',
    ]) {
      test('"$text" أمر تأكيد', () => expect(IntentService.isConfirmCommand(text), isTrue));
    }

    for (final text in [
      'خلص اكد',
      'أكد طلب',
      'بدي أأكد الطلب',
      'ابغى اكد الطلب',
      'ابعث الطلب للمحل',
      'أكد عليه',
      'ممكن تأكد الطلب',
    ]) {
      test('"$text" أمر تأكيد كذلك', () => expect(IntentService.isConfirmCommand(text), isTrue));
    }

    for (final text in [
      'لا تأكد الطلب',
      'أكد لي إن المطعم فاتح',
      'ارسل لي العروض',
      'اطلب لي كنافة من مطعم الماهر',
      'الطلب',
      'تمام',
      'وش العروض',
      '',
    ]) {
      test('"$text" مو أمر تأكيد', () => expect(IntentService.isConfirmCommand(text), isFalse));
    }
  });

  group('asksToConfirm', () {
    for (final text in [
      'ريكو اطلب من مطعم الماهر ٢ شاورما سوبر وأكد الطلب',
      'اطلب لي ٢ شاورما من مطعم الماهر واكده',
      'بدي من مطعم الماهر كنافة وأرسل الطلب على طول',
      'اطلب كنافة من الماهر وثبّته',
    ]) {
      test('"$text" يطلب التأكيد بنفس الرسالة', () => expect(IntentService.asksToConfirm(text), isTrue));
    }
    for (final text in [
      'ريكو اطلب من مطعم الماهر ٢ شاورما',
      'اطلب من الماهر شاورما بس لا تأكد الطلب',
      'اطلب كنافة وتأكد إن عندهم بارد',
      'بدي أطلب من مطعم الماهر',
    ]) {
      test('"$text" ما يطلب التأكيد', () => expect(IntentService.asksToConfirm(text), isFalse));
    }
  });

  group('isBareYes', () {
    for (final text in ['تمام', 'نعم', 'اوكي يلا', 'ايوه ريكو', 'موافق']) {
      test('"$text" موافقة', () => expect(IntentService.isBareYes(text), isTrue));
    }
    for (final text in ['تمام شكراً', 'نعم بس بدون بصل', 'ريكو', 'وش العروض']) {
      test('"$text" مو موافقة مجرّدة', () => expect(IntentService.isBareYes(text), isFalse));
    }
  });

  const maher = '64b000000000000000000002';
  const reem = '64b000000000000000000003';

  late List<String> classifyMessages;
  late List<Map<String, dynamic>> requestBodies;
  late List<String> unmatched;

  /// رد المصنّف لرسائل بعينها؛ وأي رسالة ثانية طلبٌ من مطعم الماهر.
  late Map<String, Map<String, dynamic>> classifierReplies;

  final orderFromMaher = {
    'offTopic': false,
    'reply': null,
    'mood': 'neutral',
    'intents': [
      {
        'kind': 'order',
        'placeName': 'مطعم الماهر',
        'orderItems': [
          {'name': 'شاورما', 'quantity': 2}
        ],
      }
    ],
  };

  Future<http.Response> server(http.Request request) async {
    final path = request.url.path;
    if (path == '/classify') {
      final message = (jsonDecode(request.body) as Map<String, dynamic>)['message'] as String;
      classifyMessages.add(message);
      return http.Response.bytes(utf8.encode(jsonEncode(classifierReplies[message] ?? orderFromMaher)), 200);
    }
    if (path == '/orders/resolve') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      // بلا محل: نعرض عليه محلين يختار منهما.
      if (body['businessId'] == null && body['placeName'] == null) {
        return http.Response.bytes(
          utf8.encode(jsonEncode({
            'business': null,
            'catalog': null,
            'matched': [],
            'unmatched': [],
            'suggestions': [],
            'shopOptions': [
              {'id': maher, 'name': 'مطعم الماهر', 'distanceMeters': 300, 'has': ['شاورما'], 'missing': []},
              {'id': reem, 'name': 'شاورما الريم', 'distanceMeters': 500, 'has': ['شاورما'], 'missing': []},
            ],
          })),
          200,
        );
      }
      return http.Response.bytes(
        utf8.encode(jsonEncode({
          'business': {'id': maher, 'name': 'مطعم الماهر'},
          'catalog': {
            'businessId': maher,
            'businessName': 'مطعم الماهر',
            'products': [
              {'id': 'p1', 'name': 'شاورما', 'price': 3, 'finalPrice': 3},
            ],
            'deals': [],
          },
          'matched': [
            {'itemType': 'product', 'itemId': 'p1', 'label': 'شاورما', 'unitPrice': 3, 'quantity': 2, 'requestedAs': 'شاورما'}
          ],
          'unmatched': unmatched,
          'suggestions': [],
          'shopOptions': [],
        })),
        200,
      );
    }
    if (path == '/requests' && request.method == 'POST') {
      requestBodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return http.Response('{}', 201);
    }
    return http.Response('', 404);
  }

  setUp(() async {
    classifyMessages = [];
    requestBodies = [];
    unmatched = [];
    classifierReplies = {};
    SharedPreferences.setMockInitialValues({});
    GeolocatorPlatform.instance = _FakeGeolocator();
    await AuthStore.instance.adopt(const AuthSession(
      token: 'token',
      customer: Customer(id: 'c1', name: 'ماهر', email: 'm@example.com', phone: '0790000000'),
    ));
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
    // زر التأكيد في بطاقة الطلب له نفس الأيقونة — نضغط زر حقل الكتابة بالذات.
    await tester.tap(find.descendant(of: find.byType(ChatComposer), matching: find.byIcon(Icons.send_rounded)));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> run(WidgetTester tester, Future<void> Function() body) =>
      http.runWithClient(body, () => MockClient(server));

  testWidgets('"أكّد الطلب" بعد تجهيز السلّة يرسلها بلا ضغط زر وبلا مصنّف', (tester) async {
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'اطلب لي من مطعم الماهر ٢ شاورما');
      expect(requestBodies, isEmpty);
      await say(tester, 'أكّد الطلب');
    });
    await tester.pump();

    expect(classifyMessages, ['اطلب لي من مطعم الماهر ٢ شاورما']);
    expect(requestBodies, hasLength(1));
    expect(requestBodies.single['businessId'], maher);
    expect(requestBodies.single['items'], [
      {'itemType': 'product', 'itemId': 'p1', 'quantity': 2}
    ]);
    expect(find.textContaining('أكّدت طلبك من مطعم الماهر'), findsOneWidget);
    expect(find.text('تم إرسال طلبك'), findsOneWidget);
  });

  testWidgets('"أكّد" مرة ثانية ما ترسل الطلب مرتين', (tester) async {
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'اطلب لي من مطعم الماهر ٢ شاورما');
      await say(tester, 'أكّد الطلب');
      await say(tester, 'أكد');
    });
    await tester.pump();

    expect(requestBodies, hasLength(1));
    expect(find.textContaining('وصلهم من قبل'), findsOneWidget);
  });

  testWidgets('الطلب والتأكيد برسالة وحدة: السلّة تجهز وتنرسل لحالها', (tester) async {
    const message = 'ريكو اطلب من مطعم الماهر ٢ شاورما سوبر وأكد الطلب';
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, message);
    });
    await tester.pump();

    expect(classifyMessages, [message]);
    expect(requestBodies, hasLength(1));
    expect(requestBodies.single['items'], [
      {'itemType': 'product', 'itemId': 'p1', 'quantity': 2}
    ]);
    expect(find.textContaining('أكّدت طلبك من مطعم الماهر'), findsOneWidget);
    expect(find.text('تم إرسال طلبك'), findsOneWidget);
  });

  testWidgets('…وأكّد الطلب وصنف ناقص: ما يرسل، ويقول وش الناقص', (tester) async {
    unmatched = ['بيبسي'];
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'اطلب من مطعم الماهر ٢ شاورما وبيبسي وأكد الطلب');
    });
    await tester.pump();

    expect(requestBodies, isEmpty);
    expect(find.textContaining('ما أكّدت الطلب لأن بيبسي مو موجود'), findsOneWidget);
  });

  testWidgets('…وأكّد بلا محل: يتأكّد لحاله بعد ما يختار المحل', (tester) async {
    const message = 'اطلب لي ٢ شاورما واكده';
    classifierReplies[message] = {
      'offTopic': false,
      'reply': null,
      'mood': 'neutral',
      'intents': [
        {
          'kind': 'order',
          'category': 'restaurant',
          'orderItems': [
            {'name': 'شاورما', 'quantity': 2}
          ],
        }
      ],
    };
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, message);
      expect(requestBodies, isEmpty);
      await tester.tap(find.text('اطلب من هنا').first);
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    });
    await tester.pump();

    expect(requestBodies, hasLength(1));
    expect(find.textContaining('أكّدت طلبك من مطعم الماهر'), findsOneWidget);
  });

  testWidgets('"تمام" بعد السلّة تأكيد', (tester) async {
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'اطلب لي من مطعم الماهر ٢ شاورما');
      await say(tester, 'تمام');
    });
    await tester.pump();

    expect(classifyMessages, ['اطلب لي من مطعم الماهر ٢ شاورما']);
    expect(requestBodies, hasLength(1));
  });

  testWidgets('"تمام" بعد رد غير السلّة ما يرسل شي', (tester) async {
    classifierReplies['شكراً'] = {'offTopic': true, 'reply': 'العفو 🌹', 'mood': 'neutral', 'intents': []};
    classifierReplies['تمام'] = {'offTopic': true, 'reply': 'تمام 👌', 'mood': 'neutral', 'intents': []};
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'اطلب لي من مطعم الماهر ٢ شاورما');
      await say(tester, 'شكراً');
      await say(tester, 'تمام');
    });
    await tester.pump();

    expect(classifyMessages.last, 'تمام');
    expect(requestBodies, isEmpty);
  });

  testWidgets('"أكّد" والمحلات معروضة لسه ما اختار: يطلب يختار، وما يأكّد سلّة أقدم', (tester) async {
    classifierReplies['اطلب لي شاورما'] = {
      'offTopic': false,
      'reply': null,
      'mood': 'neutral',
      'intents': [
        {
          'kind': 'order',
          'category': 'restaurant',
          'orderItems': [
            {'name': 'شاورما', 'quantity': 1}
          ],
        }
      ],
    };
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'اطلب لي من مطعم الماهر ٢ شاورما'); // سلّة قديمة مفتوحة
      await say(tester, 'اطلب لي شاورما'); // قائمة محلات
      await say(tester, 'أكّد الطلب');
    });
    await tester.pump();

    expect(requestBodies, isEmpty);
    expect(find.textContaining('اختر المحل اللي تبي تطلب منه'), findsOneWidget);
  });

  testWidgets('"أكّد الطلب" بلا سلّة مفتوحة: يقولها ويدعوه يطلب', (tester) async {
    await run(tester, () async {
      await pumpChat(tester);
      await say(tester, 'أكّد الطلب');
    });
    await tester.pump();

    expect(classifyMessages, isEmpty);
    expect(requestBodies, isEmpty);
    expect(find.textContaining('ما عندك طلب مفتوح'), findsOneWidget);
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
