import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/business_catalog.dart';
import 'package:rico_app/models/order_reply.dart';

/// نص الرد على طلب — آخر شي يقرأه العميل عن طلبه.
///
/// الردود هنا مأخوذة من تشغيل فعلي لـPOST /orders/resolve على خادم محلي
/// بمطعم اسمه «مطعم الماهر» وقائمة فيها «أرز بحليب» — فهي ما يصل العميل
/// حرفياً، لا صياغة متوقّعة.
void main() {
  ResolvedOrder resolved({
    List<ResolvedOrderLine> matched = const [],
    List<String> unmatched = const [],
    List<OrderSuggestion> suggestions = const [],
  }) =>
      ResolvedOrder(
        businessName: 'مطعم الماهر',
        matched: matched,
        unmatched: unmatched,
        suggestions: suggestions,
      );

  ResolvedOrderLine line(String label, {int quantity = 1, String? pickedBy}) =>
      ResolvedOrderLine(itemType: 'product', itemId: label, label: label, quantity: quantity, pickedBy: pickedBy);

  String reply(ResolvedOrder r) => buildOrderReplyText(shop: 'مطعم الماهر', resolved: r);

  group('«اطلب من مطعم الماهر أرز بحليب»', () {
    test('الطلب كامل', () {
      expect(
        reply(resolved(matched: [line('أرز بحليب')])),
        'جهّزت لك طلبك من مطعم الماهر — راجعه وأكّده 👇',
      );
    });

    test('جزء موجود وجزء لا', () {
      expect(
        reply(resolved(matched: [line('أرز بحليب', quantity: 2)], unmatched: ['سوشي'])),
        'جهّزت اللي لقيته من مطعم الماهر. بس ما لقيت "سوشي" عندهم — راجع الطلب وأكّده 👇',
      );
    });

    // ولا صنف تطابق: النص يوجّهه للقائمة، وما يقول "جهّزت" وما فيه شي انجهّز.
    test('ما تطابق شي، وفيه بديل قريب', () {
      expect(
        reply(resolved(
          unmatched: ['بودنغ ارز'],
          suggestions: [
            const OrderSuggestion(requested: 'بودنغ ارز', itemType: 'product', itemId: 'p1', label: 'أرز بحليب')
          ],
        )),
        'ما لقيت "بودنغ ارز" في مطعم الماهر، بس أقرب شي عندهم "أرز بحليب" — تبيه؟ وإلا هذي قائمتهم كاملة:',
      );
    });

    test('ما تطابق شي ولا فيه بديل', () {
      expect(
        reply(resolved(unmatched: ['سوشي'])),
        'ما لقيت "سوشي" في مطعم الماهر 😕 هذي قائمتهم كاملة، اختر منها اللي يعجبك:',
      );
    });

    test('صنف اختاره ريكو يُقال صراحةً ومعه إنه قابل للتغيير', () {
      expect(
        reply(resolved(matched: [line('أرز بحليب', pickedBy: 'pick')])),
        'جهّزت لك طلبك من مطعم الماهر — اخترت لك "أرز بحليب"، وتقدر تغيّره من القائمة. راجعه وأكّده 👇',
      );
    });

    test('الاختيار بسبب يذكر سببه', () {
      expect(
        reply(resolved(matched: [line('شاورما دجاج', pickedBy: 'popular')])),
        'جهّزت لك طلبك من مطعم الماهر — اخترت لك "شاورما دجاج" — الأكثر طلباً عندهم، وتقدر تغيّره من القائمة.'
            ' راجعه وأكّده 👇',
      );
    });
  });

  group('صياغة قائمة الأصناف', () {
    test('واحد، اثنان، وأكثر', () {
      expect(itemsPhrase(['كنافة']), '"كنافة"');
      expect(itemsPhrase(['كنافة', 'أرز بحليب']), '"كنافة" و"أرز بحليب"');
      expect(itemsPhrase(['كنافة', 'أرز بحليب', 'بطاطس']), '"كنافة"، "أرز بحليب" و"بطاطس"');
      expect(itemsPhrase([]), '');
    });
  });
}
