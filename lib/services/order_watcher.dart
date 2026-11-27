import 'dart:async';

import '../models/customer_order.dart';
import 'auth_store.dart';
import 'request_service.dart';

/// يتابع طلبات العميل المفتوحة ويبلّغ عن أي تغيّر بحالتها.
///
/// المحل يحرّك الطلب من لوحته (أكّد، جاهز، اعتذر)، والخادم يلغي الطلب اللي
/// ما انرد عليه بالوقت — والعميل كان ما يعرف إلا إذا فتح «طلباتي» وسحب
/// للتحديث. هنا يسأل الخادم كل [interval] ما دام فيه طلب مفتوح والتطبيق
/// قدّامه، ويسكت تماماً إذا ما فيه شي يستاهل المتابعة.
class OrderWatcher {
  final RequestService _service;
  final void Function(CustomerOrder now, CustomerOrder before) onChange;
  final Duration interval;

  OrderWatcher({
    required this.onChange,
    RequestService? service,
    this.interval = const Duration(seconds: 30),
  }) : _service = service ?? RequestService();

  final Map<String, CustomerOrder> _known = {};
  Timer? _timer;
  bool _paused = false;
  bool _polling = false;

  /// يبدأ (أو يكمل) المتابعة — بعد إرسال طلب، وعند فتح التطبيق.
  void watch() {
    if (_paused) return;
    unawaited(poll());
  }

  /// التطبيق راح للخلفية: لا نداءات على حساب بطارية العميل وباقته.
  void pause() {
    _paused = true;
    _timer?.cancel();
    _timer = null;
  }

  /// رجع للتطبيق: سؤال فوري، لأن أهم تغيّر غالباً صار وهو برّا.
  void resume() {
    _paused = false;
    unawaited(poll());
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
  }

  /// يقرأ الطلبات ويقارنها بآخر قراءة. أول قراءة تعبّي الذاكرة بس — ما
  /// نبلّغ عن تغيّر ما شفنا قبله.
  Future<void> poll() async {
    final token = AuthStore.instance.token;
    if (token == null || _polling) return;
    _polling = true;
    try {
      final orders = await _service.fetchMyOrders(token);
      for (final order in orders) {
        final before = _known[order.id];
        if (before != null && (before.status != order.status || before.cancelledBy != order.cancelledBy)) {
          onChange(order, before);
        }
        _known[order.id] = order;
      }
      _schedule(orders.any((o) => o.isOpen));
    } catch (_) {
      // شبكة متعثّرة: نحاول بالدورة الجاية ما دام فيه شي مفتوح نعرفه.
      _schedule(_known.values.any((o) => o.isOpen));
    } finally {
      _polling = false;
    }
  }

  void _schedule(bool anyOpen) {
    _timer?.cancel();
    _timer = anyOpen && !_paused ? Timer(interval, () => unawaited(poll())) : null;
  }

  /// سطر المحادثة لهذا التغيّر، أو null إذا ما يستاهل يُقال (العميل هو
  /// اللي ألغاه، أو اكتمل وهو استلمه بنفسه).
  static String? describe(CustomerOrder order) {
    final shop = order.businessName;
    final ref = '#${order.reference}';
    switch (order.status) {
      case OrderStatus.handled:
        return '✅ $shop أكّد طلبك $ref وبيتواصل معك على رقمك.';
      case OrderStatus.ready:
        return '🎉 طلبك من $shop جاهز $ref!';
      case OrderStatus.cancelled:
        switch (order.cancelledBy) {
          case CancelledBy.customer:
            return null;
          case CancelledBy.timeout:
            return '⏱️ $shop ما رد على طلبك $ref بالوقت، فلغيناه عشان ما تنتظر. تبي أطلب نفس الأصناف من محل ثاني؟';
          default:
            final note = order.vendorNote;
            return '😕 $shop اعتذر عن طلبك $ref${note != null ? ': «$note»' : '.'} تبي أطلب نفس الأصناف من محل ثاني؟';
        }
      case OrderStatus.pending:
      case OrderStatus.completed:
        return null;
    }
  }

  /// نص «نفس الأصناف» بلا اسم المحل — يمر بطريق الطلب العادي، وريكو يعرض
  /// المحلات القريبة اللي عندها الأصناف، والعميل يختار.
  static String elsewhereText(CustomerOrder order) {
    final items = order.lines.where((l) => l.label.trim().isNotEmpty).map((l) => '${l.quantity} ${l.label}').join('، ');
    return 'اطلب لي $items';
  }
}
