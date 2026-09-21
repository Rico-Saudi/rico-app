import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/business_catalog.dart';
import 'package:rico_app/models/chat_message.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/message_bubble.dart';

/// صنف طلبه العميل وما هو بالقائمة، ولقينا له أقرب شي عند المحل: يُعرض
/// **سؤالاً بحبّة** لا يُضاف تلقائياً — التشابه مو تطابق.
void main() {
  const suggestion = OrderSuggestion(
    requested: 'بودنغ أرز',
    itemType: 'product',
    itemId: 'p1',
    label: 'أرز بحليب',
  );

  Future<void> pump(WidgetTester tester, ChatMessage message) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ar', 'SA'),
        home: Scaffold(body: SingleChildScrollView(child: MessageBubble(message: message))),
      ),
    );
    await tester.pump();
  }

  testWidgets('حبّة الاقتراح تطلع باسم الصنف اللي عند المحل', (tester) async {
    await pump(
      tester,
      ChatMessage(
        text: 'ما لقيت «بودنغ أرز» عندهم — أقرب شي عندهم أرز بحليب، تبيه؟',
        sender: MessageSender.bot,
        orderSuggestions: const [suggestion],
        onAddSuggestion: (_) {},
      ),
    );

    expect(find.text('أضف أرز بحليب'), findsOneWidget);
  });

  testWidgets('الضغط يمرّر الاقتراح نفسه لا اسمه', (tester) async {
    OrderSuggestion? tapped;
    await pump(
      tester,
      ChatMessage(
        text: 'تبيه؟',
        sender: MessageSender.bot,
        orderSuggestions: const [suggestion],
        onAddSuggestion: (s) => tapped = s,
      ),
    );

    await tester.tap(find.text('أضف أرز بحليب'));
    await tester.pump();

    expect(tapped?.itemId, 'p1');
    expect(tapped?.requested, 'بودنغ أرز');
  });

  testWidgets('بلا اقتراحات ما تطلع أي حبّة', (tester) async {
    await pump(
      tester,
      ChatMessage(
        text: 'ما لقيت «سوشي» عندهم 😕',
        sender: MessageSender.bot,
        onAddSuggestion: (_) {},
      ),
    );

    expect(find.byType(InkWell), findsNothing);
  });

  test('copyWith يقدر يشيل اقتراحاً انضغط ويحتفظ بالباقي', () {
    final message = ChatMessage(
      text: 'تبيه؟',
      sender: MessageSender.bot,
      orderSuggestions: const [suggestion],
    );

    expect(message.copyWith(orderSuggestions: const []).orderSuggestions, isEmpty);
    // بلا تمرير الحقل تبقى كما هي — copyWith ما يمسح بالصمت.
    expect(message.copyWith(text: 'ثاني').orderSuggestions, hasLength(1));
  });

  test('الاقتراحات تُقرأ من رد الخادم', () {
    final resolved = ResolvedOrder.fromJson({
      'business': {'id': 'b1', 'name': 'مطعم الماهر'},
      'catalog': {'businessId': 'b1', 'businessName': 'مطعم الماهر', 'products': [], 'deals': []},
      'matched': [],
      'unmatched': ['بودنغ أرز'],
      'suggestions': [
        {'requested': 'بودنغ أرز', 'itemType': 'product', 'itemId': 'p1', 'label': 'أرز بحليب'},
      ],
    });

    expect(resolved.unmatched, ['بودنغ أرز']);
    expect(resolved.suggestions.single.label, 'أرز بحليب');
  });

  test('رد قديم بلا حقل suggestions ما ينكسر', () {
    final resolved = ResolvedOrder.fromJson({
      'business': {'id': 'b1', 'name': 'مطعم الماهر'},
      'catalog': {'businessId': 'b1', 'businessName': 'مطعم الماهر', 'products': [], 'deals': []},
      'matched': [],
      'unmatched': ['سوشي'],
    });

    expect(resolved.suggestions, isEmpty);
  });
}
