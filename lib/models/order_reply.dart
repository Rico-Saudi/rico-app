import 'business_catalog.dart';

/// "كنافة" / "كنافة وأرز بحليب" / "كنافة وأرز بحليب وبطاطس" — عربية تُقرأ،
/// لا قائمة مفصولة بفواصل.
String itemsPhrase(List<String> names) {
  if (names.isEmpty) return '';
  if (names.length == 1) return '"${names.first}"';
  final quoted = names.map((n) => '"$n"').toList();
  return '${quoted.sublist(0, quoted.length - 1).join('، ')} و${quoted.last}';
}

/// نص رد «جهّزت لك طلبك» — دالة نقية عمداً، خارج شاشة المحادثة.
///
/// هذا آخر شي يقرأه العميل عن طلبه، وكل حالاته (لقيت الكل، لقيت جزءاً، اخترت
/// لك صنفاً) تتشابك في جملة وحدة. خارج الواجهة يقدر يُقرأ ويُختبر حرفياً بدل
/// ما يُتتبّع بالعين داخل دالة بناء رسالة.
String buildOrderReplyText({required String shop, required ResolvedOrder resolved}) {
  final missing = resolved.unmatched;
  final suggestions = resolved.suggestions;
  final from = 'من $shop';

  // ولا صنف تطابق: القائمة تُفتح على التصفّح لا على سلّة، فالنص يوجّهه لها
  // بدل ما يقول "جهّزت اللي لقيته" وما فيه شي انجهّز.
  if (resolved.matched.isEmpty) {
    return suggestions.isEmpty
        ? 'ما لقيت ${itemsPhrase(missing)} في $shop 😕 هذي قائمتهم كاملة، اختر منها اللي يعجبك:'
        : 'ما لقيت ${itemsPhrase(missing)} في $shop، بس أقرب شي عندهم '
            '${itemsPhrase(suggestions.map((s) => s.label).toList())} — تبيه؟ وإلا هذي قائمتهم كاملة:';
  }

  // الصنف اللي ما سمّاه العميل ("وجبة") صار صنفاً بعينه بسلّته، فلازم يعرف
  // أيّه ولماذا — وإلا لقى سطراً ما طلبه ولا يدري من وين جا.
  final picked = resolved.matched.where((m) => m.wasPicked).toList();
  final pickedNote = picked.isEmpty
      ? ''
      : ' اخترت لك ${itemsPhrase(picked.map((p) => p.label).toList())}'
          '${picked.length == 1 && picked.first.pickReason != null ? ' — ${picked.first.pickReason}' : ''}،'
          ' وتقدر تغيّره من القائمة.';

  if (missing.isEmpty) return 'جهّزت لك طلبك $from —$pickedNote راجعه وأكّده 👇';

  if (suggestions.isEmpty) {
    return 'جهّزت اللي لقيته $from.$pickedNote بس ما لقيت ${itemsPhrase(missing)} عندهم — راجع الطلب وأكّده 👇';
  }

  return 'جهّزت اللي لقيته $from.$pickedNote ما لقيت ${itemsPhrase(missing)} عندهم — '
      'أقرب شي عندهم ${itemsPhrase(suggestions.map((s) => s.label).toList())}، تبيه؟';
}
