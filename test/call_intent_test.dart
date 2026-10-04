import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/place_result.dart';
import 'package:rico_app/models/shown_shop.dart';
import 'package:rico_app/services/intent_service.dart';
import 'package:rico_app/services/llm_intent_service.dart';
import 'package:rico_app/widgets/place_result_card.dart';

/// "اتصل على مطعم الماهر": ريكو يلقى المحل ويطلّع رقمه بزر اتصال.
void main() {
  group('نية الاتصال من المصنّف', () {
    test('اسم المحل يكفي', () {
      final intent = ResolvedIntent(kind: 'call', placeName: 'مطعم الماهر').toQueryIntent()!;
      expect(intent.kind, IntentKind.call);
      expect(intent.placeName, 'مطعم الماهر');
    });

    test('ورقمه بالقائمة يكفي كمان — "اتصل على الثاني"', () {
      final intent = ResolvedIntent(kind: 'call', referencedPosition: 2).toQueryIntent()!;
      expect(intent.kind, IntentKind.call);
      expect(intent.referencedPosition, 2);
      expect(intent.placeName, isNull);
    });

    test('بلا اسم ولا رقم ما فيه أحد نتصل عليه', () {
      expect(ResolvedIntent(kind: 'call').toQueryIntent(), isNull);
      expect(ResolvedIntent(kind: 'call', placeName: '').toQueryIntent(), isNull);
    });
  });

  PlaceResult place(String name, {String? phone}) =>
      PlaceResult(osmId: name, name: name, address: '', lat: 24.7, lng: 46.6, phone: phone);

  test('المحل المقصود يُحل من آخر قائمة بالاسم أو بالرقم', () {
    final shown = [place('مطعم البيك', phone: '0500000001'), place('مطعم الماهر', phone: '0500000002')];
    expect(findShownShop(shown, name: 'الماهر')?.phone, '0500000002');
    expect(findShownShop(shown, position: 1)?.phone, '0500000001');
  });

  Widget wrap(Widget child) => MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      );

  testWidgets('بطاقة المكان تعرض زر اتصال لما يكون عنده رقم', (tester) async {
    await tester.pumpWidget(wrap(PlaceResultCard(place: place('مطعم الماهر', phone: '0500000002'), rank: 1)));
    await tester.pump();
    expect(find.text('اتصل'), findsOneWidget);
  });

  testWidgets('وبلا رقم ما فيه زر اتصال', (tester) async {
    await tester.pumpWidget(wrap(PlaceResultCard(place: place('مطعم الماهر'), rank: 1)));
    await tester.pump();
    expect(find.text('اتصل'), findsNothing);
  });
}
