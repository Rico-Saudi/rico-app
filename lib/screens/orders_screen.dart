import 'package:flutter/material.dart';

import '../models/customer_order.dart';
import '../services/auth_store.dart';
import '../services/request_service.dart';
import '../theme/app_theme.dart';
import '../utils/arabic_dates.dart';
import '../widgets/order_widgets.dart';
import '../widgets/rico_surfaces.dart';
import 'order_details_screen.dart';

/// سجلّ طلبات العميل — الطرف المقابل لصندوق "طلبات وصلتني": كل ما أرسله
/// المستخدم للمحلات من داخل المحادثة، مجموعاً بالزمن ومفتوحاً على تفاصيله.
///
/// الطلبات تُجمع في مجموعات زمنية لا في قائمة واحدة طويلة: سجلٌّ يُفتح للسؤال
/// عن طلب بعينه ("وش طلبت من هذا المحل؟")، والزمن هو أول ما يتذكّره صاحبه.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final RequestService _service = RequestService();

  List<CustomerOrder>? _orders;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = AuthStore.instance.token;
    if (token == null) {
      setState(() {
        _orders = [];
        _error = 'انتهت جلستك، سجّل دخولك من جديد.';
      });
      return;
    }

    try {
      final orders = await _service.fetchMyOrders(token);
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _error = null;
      });
    } on RequestException catch (e) {
      if (!mounted) return;
      setState(() {
        // القائمة المعروضة تبقى كما هي عند فشل التحديث: سجلٌّ ظهر ثم اختفى
        // لأن الشبكة تعثّرت أسوأ من سجلٍّ قديم فوقه رسالة.
        _orders = _orders ?? [];
        _error = e.message;
      });
    }
  }

  void _openDetails(CustomerOrder order) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => OrderDetailsScreen(order: order)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final orders = _orders;

    return Scaffold(
      backgroundColor: RicoColors.canvas,
      appBar: AppBar(
        title: const Text('طلباتي'),
        backgroundColor: RicoColors.canvas,
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          color: RicoColors.primary,
          child: orders == null
              ? const Center(child: CircularProgressIndicator(color: RicoColors.primary))
              : _buildBody(orders),
        ),
      ),
    );
  }

  Widget _buildBody(List<CustomerOrder> orders) {
    // القائمة تبقى قابلة للسحب حتى وهي فارغة، وإلا تعطّل السحب للتحديث في
    // الحالة التي يحتاجه فيها المستخدم أكثر شيء.
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(14, 6, 14, 24),
      children: [
        if (_error != null) ...[
          _ErrorStrip(message: _error!, onRetry: _load),
          const SizedBox(height: 12),
        ],
        if (orders.isEmpty)
          const _EmptyState()
        else
          for (final group in _groupByRecency(orders)) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
              child: Text(group.label, style: RicoText.overline.copyWith(color: RicoColors.inkMuted)),
            ),
            for (final order in group.orders)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _OrderCard(order: order, onTap: () => _openDetails(order)),
              ),
          ],
      ],
    );
  }

  /// الطلبات تصل مرتّبة من الخادم (الأحدث أولاً)، فالتجميع يمشي عليها بالترتيب
  /// ويفتح مجموعة جديدة كلما تغيّر العنوان — بلا فرز ثانٍ ولا خرائط مرتّبة.
  static List<_OrderGroup> _groupByRecency(List<CustomerOrder> orders) {
    final now = DateTime.now();
    final groups = <_OrderGroup>[];
    for (final order in orders) {
      final label = ArabicDates.groupLabel(order.createdAt, now: now);
      if (groups.isEmpty || groups.last.label != label) {
        groups.add(_OrderGroup(label, [order]));
      } else {
        groups.last.orders.add(order);
      }
    }
    return groups;
  }
}

class _OrderGroup {
  final String label;
  final List<CustomerOrder> orders;

  _OrderGroup(this.label, this.orders);
}

/// بطاقة طلب في السجلّ — اسم المحل وحالته، ثم صور ما طُلب، ثم العدد والإجمالي.
/// الصور أول ما تُميّز طلباً عن طلب حين يكون المحل واحداً والطلبات متكررة.
class _OrderCard extends StatelessWidget {
  final CustomerOrder order;
  final VoidCallback onTap;

  const _OrderCard({required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return RicoCard(
      onTap: onTap,
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.storefront_rounded, size: 16, color: RicoColors.inkMuted),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  order.businessName,
                  style: RicoText.cardTitle.copyWith(fontSize: 15),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              OrderStatusChip(status: order.status),
            ],
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              OrderLineThumbnails(lines: order.lines),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.lines.isEmpty
                          ? 'بلا أصناف'
                          : '${order.lines.first.label}${order.lines.length > 1 ? ' و${order.lines.length - 1} غيره' : ''}',
                      style: RicoText.label.copyWith(fontWeight: FontWeight.w600, color: RicoColors.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${order.itemCount} ${piecesLabel(order.itemCount)}'
                      '${order.total > 0 ? '  ·  ${money(order.total)} ر.س' : ''}',
                      style: RicoText.caption.copyWith(color: RicoColors.primaryDeep, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_ios_rounded, size: 13, color: RicoColors.inkFaint),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.schedule_rounded, size: 12, color: RicoColors.inkFaint),
              const SizedBox(width: 5),
              Text(
                ArabicDates.relative(order.createdAt),
                style: RicoText.caption.copyWith(color: RicoColors.inkFaint, fontSize: 11.5),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 60),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: RicoColors.surfaceSunken, shape: BoxShape.circle),
            child: const Icon(Icons.receipt_long_rounded, size: 28, color: RicoColors.inkFaint),
          ),
          const SizedBox(height: 16),
          const Text('ما طلبت شي بعد', style: RicoText.cardTitle),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              'اسأل ريكو عن أي شي تبغاه، وأول ما تطلب من محل بيظهر طلبك هنا.',
              textAlign: TextAlign.center,
              style: RicoText.caption.copyWith(height: 1.7),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorStrip extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorStrip({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      decoration: const BoxDecoration(color: RicoColors.dangerTint, borderRadius: RicoRadii.controlR),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, size: 17, color: RicoColors.danger),
          const SizedBox(width: 9),
          Expanded(
            child: Text(message, style: RicoText.caption.copyWith(color: RicoColors.danger, height: 1.55)),
          ),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(foregroundColor: RicoColors.danger, minimumSize: const Size(0, 34)),
            child: const Text('أعد المحاولة'),
          ),
        ],
      ),
    );
  }
}
