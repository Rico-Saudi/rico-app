import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/services/intent_service.dart';
import 'package:rico_app/services/profession_catalog.dart';

/// كلمات فئات الأماكن كما هي مكتوبة فعلياً في [IntentService] — تُقرأ من
/// المصدر لا تُنسخ هنا، عشان الاختبار يبقى صادقاً لو أضاف أحد فئة جديدة.
List<String> _placeCategoryWords() {
  final source = File('lib/services/intent_service.dart').readAsStringSync();
  final start = source.indexOf('_categories = [');
  final end = source.indexOf('static const String _arabicPrefixes');
  expect(start, greaterThan(-1), reason: 'ما لقيت جدول الفئات في intent_service.dart');
  expect(end, greaterThan(start));

  final block = source.substring(start, end);
  return RegExp(r"'words': '([^']+)'")
      .allMatches(block)
      .expand((m) => m.group(1)!.split('|'))
      .map((w) => w.trim())
      .where((w) => w.isNotEmpty)
      .toList();
}

void main() {
  group('جدول المهن', () {
    test('لا تتصادم أسماء المهن مع كلمات فئات الأماكن', () {
      // القاعدة: صيغة مهنة ما تكون كلمة تعني **مكاناً** أصلاً. "عفش" محل أثاث
      // و"ميكانيكي" كراج و"كهربائيات" محل إلكترونيات — ادّعاؤها كمهنة يخلي
      // المسار الاحتياطي يرد على سؤال عن محل بقائمة أشخاص. الصيغة المقيّدة
      // هي الحل ("حلاق منزلي" لا "حلاق"). الفحص على المطابِق نفسه لا على
      // تساوي النصوص، فيمسك التصادم عبر البادئات واللواحق كمان.
      final clashes = <String>[];
      for (final word in _placeCategoryWords()) {
        final claimed = IntentService.professionFor(word);
        if (claimed != null) clashes.add('«$word» → ${claimed.slug}');
      }
      expect(clashes, isEmpty, reason: 'كلمات أماكن اختطفتها مهن:\n${clashes.join('\n')}');
    });

    test('كل صيغة تطابق نفسها', () {
      // تمسك صيغة مكتوبة غلط (مسافة زائدة، محرف غريب) ما تقدر تطابق أبداً،
      // فتبقى في الجدول بلا أي أثر.
      final dead = <String>[];
      for (final profession in ProfessionCatalog.all) {
        for (final alias in profession.aliases) {
          if (IntentService.professionFor(alias) == null) dead.add('${profession.slug}: «$alias»');
        }
      }
      expect(dead, isEmpty, reason: 'صيغ ما تطابق نفسها:\n${dead.join('\n')}');
    });

    test('السلوقات فريدة وكل مهنة تنتمي لقسم معروف', () {
      final slugs = ProfessionCatalog.all.map((p) => p.slug).toList();
      expect(slugs.toSet().length, slugs.length, reason: 'سلوق مكرر');

      final groups = ProfessionCatalog.groups.map((g) => g.slug).toSet();
      for (final profession in ProfessionCatalog.all) {
        expect(groups, contains(profession.group), reason: '${profession.slug} بقسم مجهول');
      }
    });

    test('كل قسم فيه مهنة واحدة على الأقل', () {
      for (final group in ProfessionCatalog.groups) {
        expect(
          ProfessionCatalog.all.any((p) => p.group == group.slug),
          isTrue,
          reason: 'قسم «${group.label}» فاضي، فيظهر بعنوان بلا محتوى',
        );
      }
    });
  });

  group('تطابق جدول المهن مع الخادم', () {
    // التعليقات في الملفين تقول "أي مهنة تُضاف هنا تُضاف هناك" — وهذا
    // الاختبار هو اللي يفرضها فعلاً بدل الاعتماد على الانضباط. الانحراف
    // عواقبه صامتة: مهنة موجودة على الخادم وناقصة عندنا تُصنَّف صح عبر
    // الـLLM ثم تسقط بلا اسم عربي، ومهنة عندنا وناقصة هناك تُطابَق محلياً
    // ثم يرفضها الخادم.
    final serverFile = File('server/rico-backend/src/professionals/constants/professions.ts');

    List<({String slug, String label, String group, List<String> aliases})> serverProfessions() {
      final source = serverFile.readAsStringSync();
      final pattern = RegExp(
        r"\{ slug: '([^']+)', label: '([^']+)', group: '([^']+)', aliases: \[([^\]]*)\] \}",
      );
      return pattern.allMatches(source).map((m) {
        final aliases = RegExp(r"'([^']*)'")
            .allMatches(m.group(4)!)
            .map((a) => a.group(1)!)
            .toList();
        return (slug: m.group(1)!, label: m.group(2)!, group: m.group(3)!, aliases: aliases);
      }).toList();
    }

    test('نفس السلوقات ونفس الأسماء ونفس الصيغ', () {
      // يُتخطّى إذا شُغّل الاختبار بلا مجلد الخادم (نسخة التطبيق وحدها).
      if (!serverFile.existsSync()) {
        markTestSkipped('مجلد الخادم غير موجود');
        return;
      }

      final server = serverProfessions();
      expect(server, isNotEmpty, reason: 'ما قدرت أقرأ جدول المهن من الخادم');

      expect(
        server.map((p) => p.slug).toList(),
        ProfessionCatalog.all.map((p) => p.slug).toList(),
        reason: 'السلوقات أو ترتيبها مختلف بين الخادم والتطبيق',
      );

      for (final remote in server) {
        final local = ProfessionCatalog.bySlug(remote.slug)!;
        expect(local.label, remote.label, reason: 'اسم ${remote.slug} مختلف');
        expect(local.group, remote.group, reason: 'قسم ${remote.slug} مختلف');
        expect(local.aliases, remote.aliases, reason: 'صيغ ${remote.slug} مختلفة');
      }
    });

    test('نفس الأقسام بنفس الترتيب', () {
      if (!serverFile.existsSync()) {
        markTestSkipped('مجلد الخادم غير موجود');
        return;
      }

      final source = serverFile.readAsStringSync();
      final block = source.substring(
        source.indexOf('export const PROFESSION_GROUPS = ['),
        source.indexOf('] as const;'),
      );
      final groups = RegExp(r"\{ slug: '([^']+)', label: '([^']+)' \}")
          .allMatches(block)
          .map((m) => (slug: m.group(1)!, label: m.group(2)!))
          .toList();

      expect(groups.map((g) => g.slug).toList(), ProfessionCatalog.groups.map((g) => g.slug).toList());
      expect(groups.map((g) => g.label).toList(), ProfessionCatalog.groups.map((g) => g.label).toList());
    });
  });
}
