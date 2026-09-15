import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/professional_request.dart';
import '../services/auth_store.dart';
import '../services/professionals_service.dart';
import '../theme/app_theme.dart';
import '../widgets/rico_surfaces.dart';

/// صندوق الطلبات الواردة لصاحب المهنة — الطرف الثاني من التدفّق: عميل ضغط
/// "أرسل له طلب" في المحادثة، والطلب يوصل هنا باسمه ورقمه.
///
/// الرقم يظهر كاملاً هنا عن قصد، بعكس نتائج البحث: العميل هو اللي بدأ
/// التواصل وبعث رقمه بنفسه، وبلا رقم ما فيه طلب أصلاً — فيه إشعار بلا فايدة.
class IncomingRequestsScreen extends StatefulWidget {
  const IncomingRequestsScreen({super.key});

  @override
  State<IncomingRequestsScreen> createState() => _IncomingRequestsScreenState();
}

class _IncomingRequestsScreenState extends State<IncomingRequestsScreen> {
  final ProfessionalsService _service = ProfessionalsService();

  List<IncomingProfessionalRequest>? _requests;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = AuthStore.instance.token;
    if (token == null) {
      setState(() => _error = 'انتهت جلستك، سجّل دخولك من جديد.');
      return;
    }
    try {
      final requests = await _service.fetchIncoming(token);
      if (!mounted) return;
      setState(() {
        _requests = requests;
        _error = null;
      });
    } on ProfessionalsException catch (e) {
      if (mounted) {
        setState(() {
          _requests = _requests ?? [];
          _error = e.message;
        });
      }
    }
  }

  /// التحديث متفائل: الحالة تنقلب فوراً وتُرجَع لو فشل النداء — الزر يستجيب
  /// بلا انتظار الشبكة، وما يكذب لو ما نجح.
  Future<void> _markHandled(IncomingProfessionalRequest request) async {
    final token = AuthStore.instance.token;
    if (token == null) return;

    setState(() => _replace(request.copyWith(handled: true)));
    try {
      await _service.markHandled(requestId: request.id, token: token);
    } catch (_) {
      if (!mounted) return;
      setState(() => _replace(request));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ما قدرت أحدّث حالة الطلب، حاول مرة ثانية.')),
      );
    }
  }

  void _replace(IncomingProfessionalRequest request) {
    final list = _requests;
    if (list == null) return;
    final index = list.indexWhere((r) => r.id == request.id);
    if (index != -1) list[index] = request;
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'[\s()-]'), ''));
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    final requests = _requests;

    return Scaffold(
      backgroundColor: RicoColors.canvas,
      appBar: AppBar(
        title: const Text('طلبات وصلتني'),
        shape: const Border(bottom: BorderSide(color: RicoColors.hairline)),
      ),
      body: requests == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(28),
                      child: Text(_error!, style: RicoText.body, textAlign: TextAlign.center),
                    ),
            )
          : RefreshIndicator(
              color: RicoColors.primary,
              onRefresh: _load,
              child: requests.isEmpty
                  ? ListView(
                      // قائمة لا Center: RefreshIndicator يحتاج شيئاً قابلاً
                      // للتمرير عشان يشتغل السحب للتحديث حتى وهي فارغة.
                      padding: const EdgeInsets.fromLTRB(28, 90, 28, 28),
                      children: const [_EmptyRequests()],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(14),
                      itemCount: requests.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) => _RequestCard(
                        request: requests[index],
                        onCall: () => _call(requests[index].customerPhone),
                        onMarkHandled: requests[index].handled ? null : () => _markHandled(requests[index]),
                      ),
                    ),
            ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  final IncomingProfessionalRequest request;
  final VoidCallback onCall;
  final VoidCallback? onMarkHandled;

  const _RequestCard({required this.request, required this.onCall, this.onMarkHandled});

  @override
  Widget build(BuildContext context) {
    return RicoCard(
      padding: const EdgeInsets.all(13),
      shadow: RicoShadows.subtle,
      accentBorder: request.handled ? null : RicoColors.primaryTintStrong,
      edgeStripe: request.handled ? null : RicoColors.primary,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(request.customerName, style: RicoText.cardTitle),
                    const SizedBox(height: 3),
                    Text(request.professionLabel, style: RicoText.caption.copyWith(color: RicoColors.primary)),
                  ],
                ),
              ),
              if (!request.handled)
                const RicoBadge(
                  label: 'جديد',
                  icon: Icons.fiber_new_rounded,
                  color: RicoColors.primaryDeep,
                  background: RicoColors.primaryTint,
                ),
            ],
          ),
          if (request.note != null && request.note!.isNotEmpty) ...[
            const SizedBox(height: 9),
            Text(request.note!, style: RicoText.caption.copyWith(height: 1.6)),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (request.distanceLabel != null)
                MetaChip(icon: Icons.near_me_rounded, label: 'يبعد ${request.distanceLabel}'),
              MetaChip(icon: Icons.schedule_rounded, label: _ago(request.createdAt)),
            ],
          ),
          const SizedBox(height: 11),
          const Divider(color: RicoColors.hairline, height: 1),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(
                child: TextButton.icon(
                  onPressed: onCall,
                  icon: const Icon(Icons.phone_rounded, size: 16),
                  label: Text(request.customerPhone, textDirection: TextDirection.ltr),
                  style: TextButton.styleFrom(minimumSize: const Size(0, 34)),
                ),
              ),
              if (onMarkHandled != null)
                TextButton.icon(
                  onPressed: onMarkHandled,
                  icon: const Icon(Icons.done_rounded, size: 16),
                  label: const Text('تعاملت معه'),
                  style: TextButton.styleFrom(
                    foregroundColor: RicoColors.inkMuted,
                    minimumSize: const Size(0, 34),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  /// "قبل ساعتين" بدل تاريخ كامل — الطلب الطازج هو المهم، وبعد أسبوع يصير
  /// التاريخ نفسه أوضح من عدّ الأيام.
  static String _ago(DateTime time) {
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 1) return 'الحين';
    if (diff.inMinutes < 60) return 'قبل ${diff.inMinutes} دقيقة';
    if (diff.inHours < 24) return 'قبل ${diff.inHours} ساعة';
    if (diff.inDays < 7) return 'قبل ${diff.inDays} يوم';
    return '${time.year}/${time.month}/${time.day}';
  }
}

class _EmptyRequests extends StatelessWidget {
  const _EmptyRequests();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Icon(Icons.inbox_rounded, size: 46, color: RicoColors.inkFaint),
        const SizedBox(height: 14),
        const Text('ما وصلك طلب بعد', style: RicoText.title, textAlign: TextAlign.center),
        const SizedBox(height: 7),
        Text(
          'أول ما أحد يدوّر على مهنتك ويرسل لك طلب، بيظهر هنا باسمه ورقمه.',
          style: RicoText.body.copyWith(height: 1.65),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
