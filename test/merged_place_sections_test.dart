import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/chat_message.dart';
import 'package:rico_app/models/place_result.dart';
import 'package:rico_app/models/place_section.dart';
import 'package:rico_app/services/intent_service.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/message_bubble.dart';

/// "أقرب مطعم وأرخص مطعم" رسالة وحدة، فلازم تردّها فقاعة وحدة بمقطعين
/// مسمّيين — لا فقاعتان متطابقتا الشكل ما يبيّن أيّهما جواب أيّ طلب.
void main() {
  PlaceResult place(String name, {String source = 'google'}) => PlaceResult(
        osmId: name,
        name: name,
        address: 'عنوان',
        lat: 24.7,
        lng: 46.7,
        source: source,
      );

  QueryIntent intent(String label, RankMode rank) =>
      QueryIntent(label: label, rank: rank, slug: 'restaurant');

  Future<void> pump(WidgetTester tester, ChatMessage message) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ar', 'SA'),
        home: Scaffold(
          body: SingleChildScrollView(child: MessageBubble(message: message)),
        ),
      ),
    );
    await tester.pump();
  }

  ChatMessage merged(List<PlaceSection> sections) => ChatMessage(
        text: 'لقيت لك اللي طلبته 👌',
        sender: MessageSender.bot,
        places: [for (final s in sections) ...s.places],
        placeSections: sections,
        understandingIntent: sections.first.intent,
      );

  testWidgets('المقطعان يطلعان بعنوانيهما داخل فقاعة وحدة', (tester) async {
    await pump(
      tester,
      merged([
        PlaceSection(intent: intent('مطعم', RankMode.nearest), places: [place('مطعم الركن')]),
        PlaceSection(intent: intent('مطعم', RankMode.cheapest), places: [place('مطعم البركة')]),
      ]),
    );

    expect(find.text('الأقرب · مطعم'), findsOneWidget);
    expect(find.text('الأرخص · مطعم'), findsOneWidget);
    expect(find.text('مطعم الركن'), findsOneWidget);
    expect(find.text('مطعم البركة'), findsOneWidget);
    // فقاعة وحدة = نص تمهيدي واحد، مش نصّان.
    expect(find.text('لقيت لك اللي طلبته 👌'), findsOneWidget);
  });

  testWidgets('المقطع اللي ما لقى شي يقول كذا بدل ما يختفي', (tester) async {
    await pump(
      tester,
      merged([
        PlaceSection(intent: intent('مطعم', RankMode.nearest), places: [place('مطعم الركن')]),
        PlaceSection(
          intent: intent('مطعم', RankMode.cheapest),
          emptyNote: 'ما لقيت مطعم قريب منك الحين 😕',
        ),
      ]),
    );

    expect(find.text('الأرخص · مطعم'), findsOneWidget);
    expect(find.text('ما لقيت مطعم قريب منك الحين 😕'), findsOneWidget);
  });

  testWidgets('حبّات الاقتراح تطلع مرة وحدة لا مرة لكل مقطع', (tester) async {
    await pump(
      tester,
      ChatMessage(
        text: 'لقيت لك اللي طلبته 👌',
        sender: MessageSender.bot,
        places: [place('مطعم الركن'), place('مطعم البركة')],
        placeSections: [
          PlaceSection(intent: intent('مطعم', RankMode.nearest), places: [place('مطعم الركن')]),
          PlaceSection(intent: intent('مطعم', RankMode.cheapest), places: [place('مطعم البركة')]),
        ],
        understandingIntent: intent('مطعم', RankMode.nearest),
        onQuickReply: (_) {},
      ),
    );

    expect(find.text('أبغى أرخص'), findsOneWidget);
    expect(find.text('الأقرب لي'), findsOneWidget);
  });

  testWidgets('نية وحدة تبقى بالعرض القديم بلا عناوين مقاطع', (tester) async {
    await pump(
      tester,
      ChatMessage(
        text: 'هذي أقرب مطاعم لموقعك:',
        sender: MessageSender.bot,
        places: [place('مطعم الركن')],
        understandingIntent: intent('مطعم', RankMode.nearest),
      ),
    );

    expect(find.text('مطعم الركن'), findsOneWidget);
    expect(find.text('الأقرب · مطعم'), findsNothing);
  });
}
