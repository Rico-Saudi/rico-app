import 'package:flutter/material.dart';
import '../models/customer.dart';
import '../models/request_flow.dart';
import '../services/auth_store.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';

/// بطاقة تصفّح منتجات/عروض نشاط تجاري حقيقي ثم تأكيد طلب تواصل — تعرض
/// [RequestFlow] بمراحله الثلاث (تصفّح، تأكيد/إرسال، تم الإرسال) مع مؤشر
/// خطوات في الترويسة، فيعرف المستخدم موضعه من التدفّق ولا يشعر أنه انتقل
/// لشاشة أخرى داخل المحادثة.
class CatalogFlowCard extends StatelessWidget {
  final RequestFlow flow;
  final void Function(String itemType, String itemId, String label, String? detail)? onSelectItem;

  /// تأكيد الطلب بحساب مسجّل — بلا وسائط: الاسم والرقم يأتيان من الحساب.
  final VoidCallback? onConfirm;

  /// يُطلب حين يضغط زائر زر التأكيد — يفتح ورقة الدخول.
  final VoidCallback? onRequestLogin;

  final VoidCallback? onCancel;

  const CatalogFlowCard({
    super.key,
    required this.flow,
    this.onSelectItem,
    this.onConfirm,
    this.onRequestLogin,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final submitted = flow.stage == RequestFlowStage.submitted;

    return RicoCard(
      padding: EdgeInsets.zero,
      accentBorder: submitted ? RicoColors.primaryTintStrong : RicoColors.hairline,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: submitted ? RicoColors.primaryTint : RicoColors.surfaceSunken,
              border: const Border(bottom: BorderSide(color: RicoColors.hairline)),
            ),
            child: Row(
              children: [
                Icon(
                  submitted ? Icons.task_alt_rounded : Icons.storefront_rounded,
                  size: 16,
                  color: submitted ? RicoColors.primary : RicoColors.inkMuted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    flow.catalog.businessName,
                    style: RicoText.labelStrong,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                _StageDots(stage: flow.stage),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: switch (flow.stage) {
              RequestFlowStage.browsing => _buildBrowsing(flow),
              RequestFlowStage.confirming || RequestFlowStage.submitting => _buildConfirming(flow),
              RequestFlowStage.submitted => _buildSubmitted(flow),
            },
          ),
        ],
      ),
    );
  }

  Widget _buildBrowsing(RequestFlow flow) {
    final catalog = flow.catalog;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (catalog.deals.isNotEmpty) ...[
          const RicoSectionLabel(label: 'العروض', icon: Icons.local_offer_rounded),
          for (final deal in catalog.deals)
            _ItemRow(
              title: deal.titleAr,
              subtitle: deal.typeLabel,
              icon: Icons.local_offer_rounded,
              tone: RicoColors.goldInk,
              toneBackground: RicoColors.goldTint,
              onTap: () => onSelectItem?.call('deal', deal.id, deal.titleAr, deal.typeLabel),
            ),
          if (catalog.products.isNotEmpty) const SizedBox(height: 14),
        ],
        if (catalog.products.isNotEmpty) ...[
          const RicoSectionLabel(label: 'المنتجات', icon: Icons.shopping_bag_rounded),
          for (final product in catalog.products)
            _ItemRow(
              title: product.name,
              subtitle: product.hasDiscount
                  ? '${product.finalPrice.toStringAsFixed(0)} ر.س  ·  كان ${product.price.toStringAsFixed(0)}'
                  : '${product.finalPrice.toStringAsFixed(0)} ر.س',
              icon: Icons.shopping_bag_outlined,
              tone: RicoColors.primaryDeep,
              toneBackground: RicoColors.primaryTint,
              onTap: () => onSelectItem?.call(
                'product',
                product.id,
                product.name,
                '${product.finalPrice.toStringAsFixed(0)} ر.س',
              ),
            ),
        ],
      ],
    );
  }

  /// خطوة التأكيد — تتبدّل حسب حالة الدخول: بيانات الحساب جاهزة للمسجّل،
  /// ودعوة دخول للزائر. الاستماع لـ[AuthStore] هنا لا في الشاشة يجعل
  /// البطاقة تتحدّث لحظة نجاح الدخول من الورقة السفلية بلا تمرير حالة.
  Widget _buildConfirming(RequestFlow flow) {
    final submitting = flow.stage == RequestFlowStage.submitting;

    return ListenableBuilder(
      listenable: AuthStore.instance,
      builder: (context, _) {
        final customer = AuthStore.instance.customer;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SelectedItemRow(flow: flow),
            const SizedBox(height: 12),
            if (customer != null)
              _AccountRecap(customer: customer)
            else
              const _SignInInvite(),
            if (flow.errorMessage != null) ...[
              const SizedBox(height: 10),
              _CardError(message: flow.errorMessage!),
            ],
            const SizedBox(height: 13),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: submitting ? null : onCancel,
                    child: const Text('رجوع'),
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed: submitting ? null : (customer != null ? onConfirm : onRequestLogin),
                    icon: submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Icon(customer != null ? Icons.send_rounded : Icons.lock_open_rounded, size: 17),
                    label: Text(
                      submitting
                          ? 'جارٍ الإرسال…'
                          : customer != null
                              ? 'أكّد الطلب'
                              : 'سجّل دخولك وأكّد',
                    ),
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Widget _buildSubmitted(RequestFlow flow) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: RicoColors.primaryTint, shape: BoxShape.circle),
          child: const Icon(Icons.check_rounded, size: 19, color: RicoColors.primary),
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('تم إرسال طلبك', style: RicoText.cardTitle),
              const SizedBox(height: 3),
              Text(
                '${flow.catalog.businessName} يتواصل معك قريباً على ${flow.customerPhone ?? ""}.',
                style: RicoText.caption.copyWith(height: 1.6),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// العنصر المختار (منتج أو عرض) كما سيصل للمحل.
class _SelectedItemRow extends StatelessWidget {
  final RequestFlow flow;

  const _SelectedItemRow({required this.flow});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RicoColors.surfaceSunken,
        borderRadius: RicoRadii.controlR,
        border: Border.all(color: RicoColors.hairline),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle_rounded, size: 17, color: RicoColors.primary),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(flow.selectedItemLabel ?? '', style: RicoText.labelStrong),
                if (flow.selectedItemDetail != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(flow.selectedItemDetail!, style: RicoText.caption),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// بيانات الحساب التي ستصل للمحل — تُعرض ولا تُكتب: بعد ربط الطلب بالحساب
/// صار الاسم والرقم موثّقين مرة واحدة عند التسجيل بدل كتابتهما (وإمكان
/// خطئهما) مع كل طلب.
class _AccountRecap extends StatelessWidget {
  final Customer customer;

  const _AccountRecap({required this.customer});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RicoColors.primaryTint,
        borderRadius: RicoRadii.controlR,
        border: Border.all(color: RicoColors.primaryTintStrong),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.verified_user_rounded, size: 16, color: RicoColors.primary),
              SizedBox(width: 8),
              Expanded(
                child: Text('يوصل المحل باسمك ورقمك', style: RicoText.labelStrong),
              ),
            ],
          ),
          const SizedBox(height: 9),
          _RecapRow(icon: Icons.person_outline_rounded, value: customer.name),
          const SizedBox(height: 5),
          _RecapRow(icon: Icons.phone_outlined, value: customer.phone, ltr: true),
        ],
      ),
    );
  }
}

class _RecapRow extends StatelessWidget {
  final IconData icon;
  final String value;
  final bool ltr;

  const _RecapRow({required this.icon, required this.value, this.ltr = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 14, color: RicoColors.primaryDeep),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            value,
            // الأرقام تُقرأ من اليسار حتى داخل واجهة عربية.
            textDirection: ltr ? TextDirection.ltr : null,
            textAlign: TextAlign.start,
            style: RicoText.caption.copyWith(color: RicoColors.primaryDeep, fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// دعوة الدخول للزائر — تشرح السبب قبل الزر: طلب حساب بلا سبب ظاهر أسرع
/// طريق لهجر التدفّق عند آخر خطوة فيه.
class _SignInInvite extends StatelessWidget {
  const _SignInInvite();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RicoColors.goldTint,
        borderRadius: RicoRadii.controlR,
        border: Border.all(color: RicoColors.gold.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.lock_outline_rounded, size: 17, color: RicoColors.goldInk),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('يحتاج حساب عشان نوصّل طلبك', style: RicoText.labelStrong),
                const SizedBox(height: 3),
                Text(
                  'المحل يتواصل معك على رقمك، فنتأكد منه مرة وحدة بس — ودقيقة وتخلص.',
                  style: RicoText.caption.copyWith(height: 1.6),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CardError extends StatelessWidget {
  final String message;

  const _CardError({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: const BoxDecoration(
        color: RicoColors.dangerTint,
        borderRadius: RicoRadii.controlR,
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, size: 16, color: RicoColors.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: RicoText.caption.copyWith(color: RicoColors.danger)),
          ),
        ],
      ),
    );
  }
}

/// مؤشر مرحلة التدفّق — ثلاث شُرَط تمتلئ بالتقدّم، أوضح من رقم أو نص.
class _StageDots extends StatelessWidget {
  final RequestFlowStage stage;

  const _StageDots({required this.stage});

  int get _index => switch (stage) {
        RequestFlowStage.browsing => 0,
        RequestFlowStage.confirming || RequestFlowStage.submitting => 1,
        RequestFlowStage.submitted => 2,
      };

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 3; i++)
          Container(
            width: i == _index ? 14 : 6,
            height: 4,
            margin: const EdgeInsets.only(right: 3),
            decoration: BoxDecoration(
              color: i <= _index ? RicoColors.primary : RicoColors.hairlineStrong,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
      ],
    );
  }
}

class _ItemRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color tone;
  final Color toneBackground;
  final VoidCallback onTap;

  const _ItemRow({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.tone,
    required this.toneBackground,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Material(
        color: RicoColors.surfaceSunken,
        borderRadius: RicoRadii.controlR,
        child: InkWell(
          onTap: onTap,
          borderRadius: RicoRadii.controlR,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: toneBackground, borderRadius: BorderRadius.circular(9)),
                  child: Icon(icon, size: 15, color: tone),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: RicoText.label.copyWith(fontWeight: FontWeight.w600, color: RicoColors.ink)),
                      const SizedBox(height: 2),
                      Text(subtitle, style: RicoText.caption.copyWith(color: tone)),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                // الأيقونة الاتجاهية تُعكس تلقائياً في RTL فتشير لجهة التقدّم.
                const Icon(Icons.arrow_forward_ios_rounded, size: 13, color: RicoColors.inkFaint),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
