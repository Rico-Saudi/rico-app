import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/theme/app_theme.dart';
import 'package:rico_app/widgets/auth/auth_sheet.dart';

// يتحقق من التنقّل والتحقق المحلي داخل ورقة الدخول بلا شبكة: كل ما يُختبر
// هنا يحدث قبل أول نداء للخادم.
void main() {
  Future<void> openSheet(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('ar', 'SA'),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showAuthSheet(context, reason: 'سجّل دخولك عشان نكمل الطلب.'),
                child: const Text('افتح'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('افتح'));
    await tester.pumpAndSettle();
  }

  testWidgets('تفتح على خطوة الدخول وتعرض سبب الطلب', (tester) async {
    await openSheet(tester);

    expect(find.text('سجّل دخولك'), findsOneWidget);
    expect(find.text('سجّل دخولك عشان نكمل الطلب.'), findsOneWidget);
    expect(find.text('البريد الإلكتروني'), findsOneWidget);
    expect(find.text('كلمة المرور'), findsOneWidget);
  });

  testWidgets('تنتقل لإنشاء حساب وترجع منه', (tester) async {
    await openSheet(tester);

    await tester.tap(find.text('أنشئ حساب'));
    await tester.pumpAndSettle();

    expect(find.text('أنشئ حسابك'), findsOneWidget);
    for (final field in ['الاسم', 'البريد الإلكتروني', 'رقم الجوال', 'كلمة المرور']) {
      expect(find.text(field), findsOneWidget);
    }

    await tester.tap(find.text('سجّل دخولك').last);
    await tester.pumpAndSettle();
    expect(find.text('أنشئ حسابك'), findsNothing);
  });

  testWidgets('ترفض بيانات ناقصة قبل أي نداء للخادم', (tester) async {
    await openSheet(tester);
    await tester.tap(find.text('أنشئ حساب'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'الاسم'), 'م');
    await tester.enterText(find.widgetWithText(TextFormField, 'البريد الإلكتروني'), 'not-an-email');
    await tester.enterText(find.widgetWithText(TextFormField, 'رقم الجوال'), '123');
    await tester.enterText(find.widgetWithText(TextFormField, 'كلمة المرور'), 'short');

    await tester.tap(find.text('تابع'));
    await tester.pumpAndSettle();

    expect(find.text('اكتب اسمك.'), findsOneWidget);
    expect(find.text('اكتب بريداً إلكترونياً صحيحاً.'), findsOneWidget);
    expect(find.text('اكتب رقم جوال صحيح.'), findsOneWidget);
    expect(find.text('كلمة المرور ٨ حروف على الأقل.'), findsOneWidget);
    // ما زلنا في نفس الخطوة: لم يُرسل شيء.
    expect(find.text('أنشئ حسابك'), findsOneWidget);
  });

  testWidgets('تصل لخطوة نسيت كلمة المرور', (tester) async {
    await openSheet(tester);

    await tester.tap(find.text('نسيت كلمة المرور؟'));
    await tester.pumpAndSettle();

    expect(find.text('نسيت كلمة المرور'), findsOneWidget);
    expect(find.text('أرسل الرمز'), findsOneWidget);
    expect(find.text('كلمة المرور'), findsNothing);
  });
}
