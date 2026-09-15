import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/customer.dart';
import '../../screens/incoming_requests_screen.dart';
import '../../services/auth_service.dart';
import '../../services/auth_store.dart';
import '../../theme/app_theme.dart';
import 'profession_sheet.dart';

/// ورقة الحساب — ملخّص بيانات المستخدم مع تعديلها والخروج.
///
/// نفس شكل ورقة الدخول ([showAuthSheet]) عن قصد: الدخول والحساب وجهان لنفس
/// المكان، فاختلاف الشكل بينهما يجعلهما يبدوان جزأين من تطبيقين.
Future<void> showAccountSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: RicoColors.ink.withValues(alpha: 0.42),
    builder: (_) => const AccountSheet(),
  );
}

class AccountSheet extends StatefulWidget {
  const AccountSheet({super.key});

  @override
  State<AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<AccountSheet> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();

  static final RegExp _phonePattern = RegExp(r'^[+\d][\d\s()-]{6,19}$');

  bool _editing = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _startEditing() {
    final customer = AuthStore.instance.customer;
    if (customer == null) return;
    _nameController.text = customer.name;
    _phoneController.text = customer.phone;
    setState(() {
      _editing = true;
      _error = null;
    });
  }

  Future<void> _save() async {
    if (_busy || !(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await AuthStore.instance.updateProfile(
        name: _nameController.text.trim(),
        phone: _phoneController.text.trim(),
      );
      if (mounted) setState(() => _editing = false);
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'ما قدرت أحفظ التعديل، حاول مرة ثانية.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: RicoColors.surface,
        shape: const RoundedRectangleBorder(borderRadius: RicoRadii.cardR),
        title: const Text('تسجيل الخروج', style: RicoText.title),
        content: Text(
          'بتحتاج تسجّل دخولك مرة ثانية عشان تأكّد أي طلب.',
          style: RicoText.body.copyWith(height: 1.6),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('رجوع')),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: TextButton.styleFrom(foregroundColor: RicoColors.danger),
            child: const Text('خروج'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await AuthStore.instance.signOut();
    if (mounted) Navigator.of(context).pop();
  }

  /// المهنة تُحرّر في ورقتها الخاصة: ورقة الحساب أصلاً نموذج مكتظ، ومحرّر
  /// المهنة فيه منتقٍ وموقع ونطاق ومفتاح إتاحة — حشره هنا يطمس الاثنين.
  Future<void> _openProfessionSheet() async {
    await showProfessionSheet(context);
    // لا setState: [AuthStore] يبلّغ بنفسه بعد الحفظ، وهذي الورقة مبنية
    // داخل [ListenableBuilder] يستمع له.
  }

  void _openIncomingRequests() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const IncomingRequestsScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AuthStore.instance,
      builder: (context, _) {
        final customer = AuthStore.instance.customer;
        // الخروج يُفرغ الحساب قبل أن تُغلق الورقة بإطار واحد.
        if (customer == null) return const SizedBox.shrink();

        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
          child: Container(
            decoration: const BoxDecoration(
              color: RicoColors.canvas,
              borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
            ),
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
                child: Form(
                  key: _formKey,
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
                          Container(
                            width: 52,
                            height: 52,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topRight,
                                end: Alignment.bottomLeft,
                                colors: [RicoColors.primaryLift, RicoColors.primaryDeep],
                              ),
                              shape: BoxShape.circle,
                              boxShadow: RicoShadows.brand,
                            ),
                            child: Text(
                              customer.initial,
                              style: RicoText.display.copyWith(fontSize: 22, color: Colors.white),
                            ),
                          ),
                          const SizedBox(width: 13),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(customer.name, style: RicoText.display.copyWith(fontSize: 19)),
                                const SizedBox(height: 3),
                                Text(
                                  customer.email,
                                  style: RicoText.caption,
                                  textDirection: TextDirection.ltr,
                                  textAlign: TextAlign.start,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            onPressed: () => Navigator.of(context).pop(),
                            icon: const Icon(Icons.close_rounded, size: 20),
                            tooltip: 'إغلاق',
                            style: IconButton.styleFrom(foregroundColor: RicoColors.inkMuted),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 200),
                        curve: Curves.easeOutCubic,
                        alignment: Alignment.topCenter,
                        child: _editing ? _buildEditor() : _buildDetails(customer.phone),
                      ),
                      if (!_editing) ...[
                        const SizedBox(height: 12),
                        _ProfessionSection(
                          profile: customer.professional,
                          busy: _busy,
                          onEdit: _openProfessionSheet,
                          onOpenRequests: _openIncomingRequests,
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(11),
                          decoration: const BoxDecoration(
                            color: RicoColors.dangerTint,
                            borderRadius: RicoRadii.controlR,
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.error_outline_rounded, size: 17, color: RicoColors.danger),
                              const SizedBox(width: 9),
                              Expanded(
                                child: Text(
                                  _error!,
                                  style: RicoText.caption.copyWith(color: RicoColors.danger, height: 1.55),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      TextButton.icon(
                        onPressed: _busy ? null : _signOut,
                        icon: const Icon(Icons.logout_rounded, size: 18),
                        label: const Text('تسجيل الخروج'),
                        style: TextButton.styleFrom(foregroundColor: RicoColors.danger),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildDetails(String phone) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: RicoColors.surface,
            borderRadius: RicoRadii.cardR,
            border: Border.all(color: RicoColors.hairline),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  const Icon(Icons.phone_outlined, size: 17, color: RicoColors.inkMuted),
                  const SizedBox(width: 9),
                  const Expanded(child: Text('رقم التواصل', style: RicoText.label)),
                  Text(
                    phone,
                    style: RicoText.labelStrong,
                    textDirection: TextDirection.ltr,
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 11),
                child: Divider(height: 1),
              ),
              Row(
                children: [
                  const Icon(Icons.storefront_rounded, size: 17, color: RicoColors.inkMuted),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      'هذا الرقم هو اللي يوصل للمحل مع كل طلب تأكّده.',
                      style: RicoText.caption.copyWith(height: 1.6),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _busy ? null : _startEditing,
          icon: const Icon(Icons.edit_outlined, size: 17),
          label: const Text('تعديل الاسم والرقم'),
        ),
      ],
    );
  }

  Widget _buildEditor() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          controller: _nameController,
          enabled: !_busy,
          textInputAction: TextInputAction.next,
          style: RicoText.body.copyWith(color: RicoColors.ink),
          decoration: const InputDecoration(
            labelText: 'الاسم',
            prefixIcon: Icon(Icons.person_outline_rounded, size: 19),
          ),
          validator: (value) => (value ?? '').trim().length < 2 ? 'اكتب اسمك.' : null,
        ),
        const SizedBox(height: 10),
        TextFormField(
          controller: _phoneController,
          enabled: !_busy,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          textDirection: TextDirection.ltr,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d+\s()-]'))],
          onFieldSubmitted: (_) => _save(),
          style: RicoText.body.copyWith(color: RicoColors.ink),
          decoration: const InputDecoration(
            labelText: 'رقم الجوال',
            prefixIcon: Icon(Icons.phone_outlined, size: 19),
          ),
          validator: (value) => _phonePattern.hasMatch((value ?? '').trim()) ? null : 'اكتب رقم جوال صحيح.',
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _busy ? null : () => setState(() => _editing = false),
                child: const Text('إلغاء'),
              ),
            ),
            const SizedBox(width: 9),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('احفظ'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// قسم "مهنتي" في ورقة الحساب — حالتان: من ما أضاف مهنة يرى دعوة سطر واحد،
/// ومن أضافها يرى مهنته وحالتها ومدخلاً لطلباته الواردة.
class _ProfessionSection extends StatelessWidget {
  final ProfessionalProfile? profile;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback onOpenRequests;

  const _ProfessionSection({
    required this.profile,
    required this.busy,
    required this.onEdit,
    required this.onOpenRequests,
  });

  @override
  Widget build(BuildContext context) {
    final profile = this.profile;

    if (profile == null) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: RicoColors.surface,
          borderRadius: RicoRadii.cardR,
          border: Border.all(color: RicoColors.hairline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                Icon(Icons.engineering_rounded, size: 17, color: RicoColors.inkMuted),
                SizedBox(width: 9),
                Expanded(child: Text('عندك مهنة؟', style: RicoText.labelStrong)),
              ],
            ),
            const SizedBox(height: 7),
            Text(
              'أضف مهنتك وموقع شغلك، ويلقونك أول ما أحد قريب منك يدوّر عليها.',
              style: RicoText.caption.copyWith(height: 1.6),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: busy ? null : onEdit,
              icon: const Icon(Icons.add_rounded, size: 17),
              label: const Text('أضف مهنتك'),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: RicoColors.surface,
        borderRadius: RicoRadii.cardR,
        border: Border.all(color: RicoColors.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.engineering_rounded, size: 17, color: RicoColors.primary),
              const SizedBox(width: 9),
              Expanded(child: Text(profile.professionLabel, style: RicoText.labelStrong)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: profile.isAvailable ? RicoColors.primaryTint : RicoColors.surfaceSunken,
                  borderRadius: RicoRadii.pillR,
                ),
                child: Text(
                  profile.isAvailable ? 'ظاهر للباحثين' : 'مخفي مؤقتاً',
                  style: RicoText.overline.copyWith(
                    color: profile.isAvailable ? RicoColors.primaryDeep : RicoColors.inkMuted,
                  ),
                ),
              ),
            ],
          ),
          if (profile.headline != null && profile.headline!.isNotEmpty) ...[
            const SizedBox(height: 7),
            Text(profile.headline!, style: RicoText.caption.copyWith(height: 1.6)),
          ],
          const SizedBox(height: 7),
          Text(
            'تخدم لين ${(profile.serviceRadiusMeters / 1000).round()} كم من موقع شغلك.',
            style: RicoText.caption.copyWith(color: RicoColors.inkFaint),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 11),
            child: Divider(height: 1),
          ),
          Row(
            children: [
              Expanded(
                child: TextButton.icon(
                  onPressed: onOpenRequests,
                  icon: const Icon(Icons.inbox_rounded, size: 17),
                  label: const Text('طلبات وصلتني'),
                  style: TextButton.styleFrom(minimumSize: const Size(0, 36)),
                ),
              ),
              TextButton.icon(
                onPressed: busy ? null : onEdit,
                icon: const Icon(Icons.edit_outlined, size: 17),
                label: const Text('تعديل'),
                style: TextButton.styleFrom(
                  foregroundColor: RicoColors.inkMuted,
                  minimumSize: const Size(0, 36),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
