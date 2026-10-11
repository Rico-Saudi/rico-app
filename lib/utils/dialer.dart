import 'package:url_launcher/url_launcher.dart';

/// يفتح تطبيق الهاتف والرقم جاهز — المستخدم هو اللي يضغط اتصال. ما فيه
/// تطبيق يقدر يتصل بدون موافقته (iOS يمنعه أصلاً)، وهذا المطلوب: ريكو يجهّز
/// المكالمة، ما يسوّيها عنه.
///
/// يرجع false إذا الجهاز ما عنده هاتف (محاكي، تابلت بلا شريحة).
Future<bool> openDialer(String phone) async {
  final uri = Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'[\s()-]'), ''));
  if (!await canLaunchUrl(uri)) return false;
  return launchUrl(uri);
}
