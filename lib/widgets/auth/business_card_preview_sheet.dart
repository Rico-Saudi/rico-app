import 'package:flutter/material.dart';
import '../../services/auth_store.dart';
import '../../services/professionals_service.dart';
import '../../theme/app_theme.dart';
import '../business_card.dart';

/// ما اختاره المستخدم من ورقة المعاينة.
enum BusinessCardPreviewAction { done, edit }

/// يعرض بطاقتك كما صارت بعد الحفظ — نفس الودجت الذي يراه العميل في
/// المحادثة، لا رسماً يشبهه.
///
/// تُفتح مرة بعد الحفظ لأن "حفظنا بياناتك ✅" ما يقول للشخص كيف صار يظهر
/// للناس. البطاقة نفسها هي الرد.
Future<BusinessCardPreviewAction> showBusinessCardPreview(BuildContext context) async {
  final action = await showModalBottomSheet<BusinessCardPreviewAction>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: RicoColors.ink.withValues(alpha: 0.42),
    builder: (_) => const _BusinessCardPreviewSheet(),
  );
  return action ?? BusinessCardPreviewAction.done;
}

class _BusinessCardPreviewSheet extends StatelessWidget {
  const _BusinessCardPreviewSheet();

  @override
  Widget build(BuildContext context) {
    final customer = AuthStore.instance.customer;
    final profile = customer?.professional;

    // ما يُفترض يصير (الورقة تُفتح بعد حفظ ناجح)، لكن الحساب قد يكون انتهت
    // جلسته بين الحفظ والعرض — نغلق بهدوء بدل ما نرسم بطاقة فاضية.
    if (customer == null || profile == null) {
      return const SizedBox.shrink();
    }

    final card = profile.toCard(
      name: customer.name,
      cvUrl: ProfessionalsService.cvUrl(profile.cvPath),
    );

    return Container(
      decoration: const BoxDecoration(
        color: RicoColors.canvas,
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: RicoColors.hairlineStrong,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  const Icon(Icons.check_circle_rounded, size: 20, color: RicoColors.success),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text('بطاقتك جاهزة', style: RicoText.display.copyWith(fontSize: 19)),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                profile.isAvailable
                    ? 'هذي بالضبط اللي تظهر لأي أحد قريب منك يدوّر على ${profile.professionLabel}.'
                    : 'كذا تظهر بطاقتك — بس هي مخفية الحين لأنك موقف "متاح للطلبات".',
                style: RicoText.caption.copyWith(height: 1.65),
              ),
              const SizedBox(height: 16),

              BusinessCard(card: card),

              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(BusinessCardPreviewAction.done),
                child: const Text('تمام'),
              ),
              const SizedBox(height: 6),
              TextButton.icon(
                onPressed: () => Navigator.of(context).pop(BusinessCardPreviewAction.edit),
                icon: const Icon(Icons.tune_rounded, size: 18),
                label: const Text('عدّل البطاقة'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
