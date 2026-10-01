import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'screens/splash_screen.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const RicoApp());
}

class RicoApp extends StatelessWidget {
  const RicoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ريكو',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      // العربية هي لغة التطبيق الوحيدة: تثبيتها هنا مع مُفوّضات الترجمة يجعل
      // الاتجاه RTL وكل نصوص ودجتس Material (قوائم النسخ/اللصق، التواريخ)
      // عربية تلقائياً، بدل تغليف كل شاشة بـ Directionality يدوياً.
      locale: const Locale('ar', 'SA'),
      supportedLocales: const [Locale('ar', 'SA'), Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const SplashScreen(),
    );
  }
}
