import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:rico_app/main.dart';

void main() {
  setUp(() {
    // شاشة البداية تستعيد جلسة الدخول من SharedPreferences قبل أن تنتقل،
    // فبدون قيم وهمية يعلق الإقلاع على قناة المنصة غير الموجودة في الاختبار.
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('يبدأ التطبيق بشاشة البداية ثم ينتقل للمحادثة', (WidgetTester tester) async {
    await tester.pumpWidget(const RicoApp());

    expect(find.text('ريكو'), findsWidgets);
    expect(find.text('أقرب مكان وأفضل عرض، حسب موقعك'), findsOneWidget);

    // تجاوز أقل مدة عرض (١٫٥ ثانية) ثم زمن التلاشي للمحادثة.
    await tester.pump(const Duration(milliseconds: 1600));
    await tester.pump(const Duration(milliseconds: 600));

    // شاشة الترحيب داخل المحادثة — أول ما يراه مستخدم بلا محادثة محفوظة.
    expect(find.text('جرّب تسألني'), findsOneWidget);
  });
}
