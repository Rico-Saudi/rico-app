import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/business_catalog.dart';
import 'package:rico_app/services/intent_service.dart';
import 'package:rico_app/services/llm_intent_service.dart';

/// فكّ نية الطلب من رد المصنّف، وقراءة نتيجة المطابقة من الخادم.
void main() {
  group('نية الطلب من المصنّف', () {
    ResolvedIntent orderIntent({
      String? placeName = 'مطعم الماهر',
      List<RequestedItem> items = const [
        RequestedItem(name: 'كنافة نابلسية'),
        RequestedItem(name: 'أرز بحليب'),
      ],
    }) =>
        ResolvedIntent(kind: 'order', placeName: placeName, orderItems: items);

    test('تتحول لنية طلب فيها المحل والأصناف', () {
      final intent = orderIntent().toQueryIntent()!;
      expect(intent.kind, IntentKind.order);
      expect(intent.placeName, 'مطعم الماهر');
      expect(intent.orderItems.map((i) => i.name), ['كنافة نابلسية', 'أرز بحليب']);
      expect(intent.orderItems.first.quantity, 1);
    });

    test('تُسقط إذا نقص اسم المحل — ما فيه شي نفتحه', () {
      expect(orderIntent(placeName: null).toQueryIntent(), isNull);
      expect(orderIntent(placeName: '').toQueryIntent(), isNull);
    });

    test('محل بلا أصناف يبقى نية صحيحة — طلب لرؤية القائمة', () {
      // "بدي أطلب من مطعم الماهر": إسقاطها كان يرجّعه لبحث عام عن مطاعم،
      // وهو سؤال ما سأله.
      final intent = orderIntent(items: const []).toQueryIntent()!;
      expect(intent.kind, IntentKind.order);
      expect(intent.placeName, 'مطعم الماهر');
      expect(intent.orderItems, isEmpty);
    });

    test('تحفظ الكمية كما نطقها المستخدم', () {
      final intent = orderIntent(items: const [RequestedItem(name: 'كنافة', quantity: 3)]).toQueryIntent()!;
      expect(intent.orderItems.first.quantity, 3);
    });

    test('الصنف يُرسل للخادم باسمه وكميته فقط', () {
      expect(const RequestedItem(name: 'كنافة', quantity: 2).toJson(), {'name': 'كنافة', 'quantity': 2});
    });
  });

  group('قراءة نتيجة المطابقة', () {
    Map<String, dynamic> payload({
      bool foundShop = true,
      List<Map<String, dynamic>>? matched,
      List<String> unmatched = const [],
    }) =>
        {
          'business': foundShop ? {'id': 'b1', 'name': 'مطعم الماهر'} : null,
          'catalog': foundShop
              ? {
                  'businessId': 'b1',
                  'businessName': 'مطعم الماهر',
                  'products': [
                    {'id': 'p1', 'name': 'كنافة نابلسية', 'price': 20, 'finalPrice': 20, 'imageUrl': '/products/images/abc'},
                  ],
                  'deals': [],
                }
              : null,
          'matched': matched ??
              [
                {
                  'itemType': 'product',
                  'itemId': 'p1',
                  'label': 'كنافة نابلسية',
                  'detail': '20 ر.س',
                  'unitPrice': 20,
                  'imageUrl': '/products/images/abc',
                  'quantity': 2,
                  'requestedAs': 'كنافة',
                }
              ],
          'unmatched': unmatched,
        };

    test('تبني أسطر السلّة بروابط صور كاملة', () {
      final resolved = ResolvedOrder.fromJson(payload(), baseUrl: 'https://app.rico-go.com');
      expect(resolved.foundBusiness, isTrue);
      expect(resolved.matched.single.imageUrl, 'https://app.rico-go.com/products/images/abc');
      expect(resolved.matched.single.quantity, 2);
    });

    test('تحتفظ بما نطقه المستخدم بجانب ما طوبق به', () {
      final resolved = ResolvedOrder.fromJson(payload());
      expect(resolved.matched.single.requestedAs, 'كنافة');
      expect(resolved.matched.single.label, 'كنافة نابلسية');
    });

    test('تُبقي الأصناف المفقودة ظاهرة', () {
      final resolved = ResolvedOrder.fromJson(payload(unmatched: ['بيتزا', 'سوشي']));
      expect(resolved.unmatched, ['بيتزا', 'سوشي']);
      expect(resolved.foundNothing, isFalse);
    });

    test('تميّز "ما لقيت المحل" عن "ما لقيت الأصناف"', () {
      final noShop = ResolvedOrder.fromJson(payload(foundShop: false, matched: [], unmatched: ['كنافة']));
      expect(noShop.foundBusiness, isFalse);

      final noItems = ResolvedOrder.fromJson(payload(matched: [], unmatched: ['بيتزا']));
      expect(noItems.foundBusiness, isTrue);
      expect(noItems.foundNothing, isTrue);
    });
  });
}
