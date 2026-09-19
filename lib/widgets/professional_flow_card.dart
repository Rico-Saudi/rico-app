import 'package:flutter/material.dart';
import '../models/professional.dart';
import '../models/professional_flow.dart';
import '../services/auth_store.dart';
import '../services/professionals_service.dart';
import '../theme/app_theme.dart';
import 'business_card.dart';
import 'rico_surfaces.dart';

/// قائمة أقرب أصحاب مهنة، ثم تأكيد إرسال طلب تواصل لواحد منهم — نظير
/// [CatalogFlowCard] لكن للأشخاص: ما فيه كتالوج يُتصفّح، الاختيار هو الشخص.
///
/// مرحلة التأكيد تعرض الاسم والرقم اللي بيوصلان له فعلاً، عشان يعرف العميل
/// وش يشارك قبل ما يضغط — لا تُطلب منه كتابتهما، هما من حسابه الموثّق.
class ProfessionalFlowCard extends StatefulWidget {
  final ProfessionalFlow flow;
  final void Function(Professional professional)? onSelect;

  /// تأكيد الإرسال بحساب مسجّل، ومعه وصف الشغلة إن كُتب.
  final void Function(String? note)? onConfirm;

  /// يُطلب حين يضغط زائر زر الإرسال — يفتح ورقة الدخول.
  final VoidCallback? onRequestLogin;

  final VoidCallback? onCancel;

  const ProfessionalFlowCard({
    super.key,
    required this.flow,
    this.onSelect,
    this.onConfirm,
    this.onRequestLogin,
    this.onCancel,
  });

  @override
  State<ProfessionalFlowCard> createState() => _ProfessionalFlowCardState();
}

class _ProfessionalFlowCardState extends State<ProfessionalFlowCard> {
  final TextEditingController _noteController = TextEditingController();

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final flow = widget.flow;

    if (flow.stage == ProfessionalFlowStage.browsing) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < flow.professionals.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            BusinessCard(
              // نفس البطاقة التي بناها صاحبها ورآها في المعاينة — الرابط
              // وحده يُبنى هنا، لأن الخادم يرسل مساراً نسبياً.
              card: flow.professionals[i].toCard(
                photoUrl: ProfessionalsService.fileUrl(flow.professionals[i].photoPath),
                cvUrl: ProfessionalsService.fileUrl(flow.professionals[i].cvPath),
              ),
              rank: i + 1,
              onRequest: widget.onSelect == null ? null : () => widget.onSelect!(flow.professionals[i]),
            ),
          ],
        ],
      );
    }

    final selected = flow.selected;
    if (selected == null) return const SizedBox.shrink();

    final submitted = flow.stage == ProfessionalFlowStage.submitted;
    final submitting = flow.stage == ProfessionalFlowStage.submitting;

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
                  submitted ? Icons.task_alt_rounded : Icons.handshake_rounded,
                  size: 16,
                  color: submitted ? RicoColors.primary : RicoColors.inkMuted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    submitted ? 'وصل طلبك لـ${selected.name}' : '${selected.name} — ${selected.professionLabel}',
                    style: RicoText.labelStrong,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                MetaChip(icon: Icons.near_me_rounded, label: selected.distanceLabel, filled: false),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: submitted
                ? _Submitted(name: selected.name)
                : _Confirm(
                    noteController: _noteController,
                    errorMessage: flow.errorMessage,
                    submitting: submitting,
                    onConfirm: widget.onConfirm,
                    onRequestLogin: widget.onRequestLogin,
                    onCancel: widget.onCancel,
                  ),
          ),
        ],
      ),
    );
  }
}

class _Submitted extends StatelessWidget {
  final String name;

  const _Submitted({required this.name});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('أرسلت طلبك 👌', style: RicoText.bodyStrong),
        const SizedBox(height: 5),
        // ما نوعد نيابة عنه بوقت ولا بسعر — كل اللي صار فعلاً إن الطلب وصله.
        Text(
          'وصل $name اسمك ورقمك، وبيتواصل معك بنفسه.',
          style: RicoText.caption,
        ),
      ],
    );
  }
}

/// مرحلة التأكيد: وصف اختياري للشغلة، ثم من سيصله الطلب، ثم زر الإرسال.
class _Confirm extends StatelessWidget {
  final TextEditingController noteController;
  final String? errorMessage;
  final bool submitting;
  final void Function(String? note)? onConfirm;
  final VoidCallback? onRequestLogin;
  final VoidCallback? onCancel;

  const _Confirm({
    required this.noteController,
    required this.errorMessage,
    required this.submitting,
    this.onConfirm,
    this.onRequestLogin,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final customer = AuthStore.instance.customer;
    final signedIn = AuthStore.instance.isSignedIn && customer != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: noteController,
          enabled: !submitting,
          maxLines: 2,
          maxLength: 300,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(
            labelText: 'وش الشغلة؟ (اختياري)',
            hintText: 'مثال: أبي أدهن غرفتين',
            counterText: '',
          ),
        ),
        const SizedBox(height: 10),
        if (signedIn)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: const BoxDecoration(
              color: RicoColors.surfaceSunken,
              borderRadius: RicoRadii.controlR,
            ),
            child: Row(
              children: [
                const Icon(Icons.person_rounded, size: 15, color: RicoColors.inkMuted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'بيوصله: ${customer.name} — ${customer.phone}',
                    style: RicoText.caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          )
        else
          const Text(
            'سجّل دخولك عشان يوصله اسمك ورقمك ويقدر يتصل فيك.',
            style: RicoText.caption,
          ),
        if (errorMessage != null) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: const BoxDecoration(
              color: RicoColors.dangerTint,
              borderRadius: RicoRadii.controlR,
            ),
            child: Text(
              errorMessage!,
              style: RicoText.caption.copyWith(color: RicoColors.danger),
            ),
          ),
        ],
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: submitting
                    ? null
                    : signedIn
                        ? () => onConfirm?.call(noteController.text)
                        : onRequestLogin,
                icon: submitting
                    ? const SizedBox(
                        width: 15,
                        height: 15,
                        child: CircularProgressIndicator(strokeWidth: 2, color: RicoColors.onPrimary),
                      )
                    : Icon(signedIn ? Icons.send_rounded : Icons.login_rounded, size: 17),
                label: Text(submitting
                    ? 'جارٍ الإرسال…'
                    : signedIn
                        ? 'أكّد إرسال الطلب'
                        : 'سجّل دخولك وأرسل'),
              ),
            ),
            const SizedBox(width: 8),
            TextButton(
              onPressed: submitting ? null : onCancel,
              child: const Text('رجوع'),
            ),
          ],
        ),
      ],
    );
  }
}
