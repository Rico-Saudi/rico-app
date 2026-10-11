/// صياغة التواريخ بالعربية بلا تهيئة locale — نفس اختيار [MessageBubble]:
/// أرقام لاتينية بلاحقة ص/م، وهي ما يقرأه المستخدم السعودي فعلاً على جواله.
class ArabicDates {
  ArabicDates._();

  static const List<String> _months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  static String time(DateTime t) {
    final hour12 = t.hour % 12 == 0 ? 12 : t.hour % 12;
    return '$hour12:${t.minute.toString().padLeft(2, '0')} ${t.hour < 12 ? 'ص' : 'م'}';
  }

  static String date(DateTime t) => '${t.day} ${_months[t.month - 1]} ${t.year}';

  /// كم يوماً بين اليومين تقويمياً — لا بفارق الساعات: طلبٌ الساعة ١١ مساءً
  /// أمس عمره ساعتان، ومع ذلك «أمس» لا «اليوم».
  static int _daysAgo(DateTime t, DateTime now) {
    final then = DateTime(t.year, t.month, t.day);
    final today = DateTime(now.year, now.month, now.day);
    return today.difference(then).inDays;
  }

  /// سطر الوقت تحت الطلب: قريبُه بالساعة، وبعيدُه بالتاريخ.
  static String relative(DateTime t, {DateTime? now}) {
    final reference = now ?? DateTime.now();
    final days = _daysAgo(t, reference);
    if (days == 0) return 'اليوم ${time(t)}';
    if (days == 1) return 'أمس ${time(t)}';
    if (days < 7) return 'قبل $days أيام';
    return date(t);
  }

  /// عنوان المجموعة في سجلّ الطلبات.
  static String groupLabel(DateTime t, {DateTime? now}) {
    final days = _daysAgo(t, now ?? DateTime.now());
    if (days == 0) return 'اليوم';
    if (days == 1) return 'أمس';
    if (days < 7) return 'هذا الأسبوع';
    if (days < 30) return 'هذا الشهر';
    return 'أقدم';
  }
}
