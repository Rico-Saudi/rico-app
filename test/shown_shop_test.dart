import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/place_result.dart';
import 'package:rico_app/models/shown_shop.dart';
import 'package:rico_app/services/intent_service.dart';
import 'package:rico_app/services/llm_intent_service.dart';

/// "شو المطاعم القريبة؟" ثم "بدي أطلب من الثاني" — أي محل من القائمة يقصد.
void main() {
  PlaceResult shop(String id, String name) =>
      PlaceResult(osmId: id, name: name, address: '', lat: 0, lng: 0, source: 'rico');

  final shown = [
    shop('a', 'مطعم الماهر'),
    shop('b', 'شاورما الريم'),
    shop('c', 'مطعم القدس'),
  ];

  group('المحل المقصود من آخر قائمة', () {
    test('بالرقم', () {
      expect(findShownShop(shown, position: 2)!.osmId, 'b');
      expect(findShownShop(shown, position: 1)!.osmId, 'a');
    });

    test('رقم برّا القائمة ما يختار شي', () {
      expect(findShownShop(shown, position: 4), isNull);
      expect(findShownShop(shown, position: 0), isNull);
    });

    test('بالاسم الكامل أو جزئه', () {
      expect(findShownShop(shown, name: 'مطعم القدس')!.osmId, 'c');
      expect(findShownShop(shown, name: 'الماهر')!.osmId, 'a');
    });

    test('الاسم يتجاوز فروق الكتابة الشائعة', () {
      final withTaa = [shop('x', 'حلويات نفيسة'), ...shown];
      expect(findShownShop(withTaa, name: 'حلويات نفيسه')!.osmId, 'x');
      expect(findShownShop([shop('y', 'كافيه الأمير')], name: 'كافيه الامير')!.osmId, 'y');
    });

    // "مطعم" تطابق اثنين بالقائمة — اختيار واحد منهم تخمين يوصّل الطلب للغلط.
    test('اسم يطابق أكثر من محل ما يختار شي', () {
      expect(findShownShop(shown, name: 'مطعم'), isNull);
    });

    test('الاسم يغلب الرقم إذا طابق محلاً واحداً', () {
      expect(findShownShop(shown, position: 1, name: 'مطعم القدس')!.osmId, 'c');
    });

    test('اسم ما يطابق شي يرجع للرقم', () {
      expect(findShownShop(shown, position: 2, name: 'مطعم غير موجود')!.osmId, 'b');
    });

    test('اسم ما يطابق شي بلا رقم ما يختار شي', () {
      expect(findShownShop(shown, name: 'مطعم غير موجود'), isNull);
    });
  });

  group('نية الطلب برقم من القائمة', () {
    test('الرقم وحده يكفي — بلا اسم وبلا أصناف', () {
      final intent = ResolvedIntent(kind: 'order', referencedPosition: 2).toQueryIntent()!;
      expect(intent.kind, IntentKind.order);
      expect(intent.referencedPosition, 2);
      expect(intent.placeName, isNull);
      expect(intent.orderItems, isEmpty);
    });

    test('الرقم يبقى مع الاسم والأصناف', () {
      final intent = ResolvedIntent(
        kind: 'order',
        placeName: 'مطعم الماهر',
        referencedPosition: 1,
        orderItems: const [RequestedItem(name: 'شاورما', quantity: 2)],
      ).toQueryIntent()!;
      expect(intent.referencedPosition, 1);
      expect(intent.placeName, 'مطعم الماهر');
      expect(intent.orderItems.single.quantity, 2);
    });
  });
}
