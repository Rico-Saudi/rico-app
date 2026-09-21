import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/chat_message.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/chat_composer.dart';
import 'package:rico_app/widgets/message_bubble.dart';

/// تعديل رسالة بعد إرسالها: الزر يظهر لرسائل المستخدم وحدها، والمؤلّف يقول
/// صراحةً إن الرد القديم بينحذف — الحذف نفسه مسؤولية الشاشة عند الإرسال.
void main() {
  Future<void> pumpBubble(
    WidgetTester tester,
    ChatMessage message, {
    VoidCallback? onEdit,
    bool editing = false,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ar', 'SA'),
        home: Scaffold(
          body: MessageBubble(message: message, onEdit: onEdit, editing: editing),
        ),
      ),
    );
    await tester.pump();
  }

  group('زر التعديل على الفقاعة', () {
    testWidgets('يظهر على رسالة المستخدم وينادي رده', (tester) async {
      var tapped = 0;
      await pumpBubble(
        tester,
        ChatMessage(text: 'أقرب مطعم', sender: MessageSender.user),
        onEdit: () => tapped++,
      );

      expect(find.text('تعديل'), findsOneWidget);
      await tester.tap(find.text('تعديل'));
      expect(tapped, 1);
    });

    testWidgets('ما يظهر على رد ريكو', (tester) async {
      await pumpBubble(tester, ChatMessage(text: 'لقيت لك 👌', sender: MessageSender.bot));
      expect(find.text('تعديل'), findsNothing);
    });

    testWidgets('ما يظهر وريكو مشغول (onEdit فاضي)', (tester) async {
      await pumpBubble(tester, ChatMessage(text: 'أقرب مطعم', sender: MessageSender.user));
      expect(find.text('تعديل'), findsNothing);
    });

    testWidgets('الفقاعة تحت التعديل تُعرض باهتة', (tester) async {
      final message = ChatMessage(text: 'أقرب مطعم', sender: MessageSender.user);
      await pumpBubble(tester, message, onEdit: () {}, editing: true);

      final opacity = tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity).first);
      expect(opacity.opacity, lessThan(1));
    });
  });

  group('شريط التعديل في المؤلّف', () {
    Future<void> pumpComposer(
      WidgetTester tester, {
      required bool editing,
      required TextEditingController controller,
      VoidCallback? onCancelEdit,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          locale: const Locale('ar', 'SA'),
          home: Scaffold(
            body: Align(
              alignment: Alignment.bottomCenter,
              child: ChatComposer(
                controller: controller,
                onSend: () {},
                busy: false,
                onRecorded: (_) {},
                onMicUnavailable: () {},
                editing: editing,
                onCancelEdit: onCancelEdit ?? () {},
              ),
            ),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets('يقول إن الرد القديم بينحذف، وما يظهر بلا تعديل', (tester) async {
      final controller = TextEditingController(text: 'أقرب مطعم');
      addTearDown(controller.dispose);

      await pumpComposer(tester, editing: false, controller: controller);
      expect(find.textContaining('تعديل رسالتك'), findsNothing);

      await pumpComposer(tester, editing: true, controller: controller);
      expect(find.textContaining('الرد القديم بينحذف'), findsOneWidget);
    });

    testWidgets('زر الإلغاء ينادي رده', (tester) async {
      final controller = TextEditingController(text: 'أقرب مطعم');
      addTearDown(controller.dispose);
      var cancelled = 0;

      await pumpComposer(
        tester,
        editing: true,
        controller: controller,
        onCancelEdit: () => cancelled++,
      );

      await tester.tap(find.bySemanticsLabel('إلغاء التعديل'));
      expect(cancelled, 1);
    });
  });
}
