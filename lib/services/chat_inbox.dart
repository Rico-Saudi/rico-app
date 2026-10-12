import 'package:flutter/foundation.dart';

/// رسالة تنتظر تنكتب بالمحادثة كأن العميل كتبها — من شاشة ثانية فوقها
/// («اطلب نفسه مرة ثانية» بتفاصيل طلب قديم).
///
/// الشاشات اللي تحت المحادثة (حسابي ← طلباتي ← التفاصيل) ما تعرف المحادثة
/// ولا لازم تعرفها؛ تحط النص هنا وترجع، والمحادثة تسمع وترسله.
class ChatInbox {
  ChatInbox._();

  static final ValueNotifier<String?> pending = ValueNotifier<String?>(null);

  static void send(String text) => pending.value = text;

  /// يأخذ الرسالة مرة وحدة ويفرّغ الصندوق.
  static String? take() {
    final text = pending.value;
    pending.value = null;
    return text;
  }
}
