import 'package:flutter/material.dart';
import '../../models/profession.dart';
import '../../services/auth_service.dart';
import '../../services/auth_store.dart';
import '../../services/location_service.dart';
import '../../services/profession_catalog.dart';
import '../../services/professionals_service.dart';
import '../../theme/app_theme.dart';
import 'profession_picker.dart';

/// ورقة "مهنتي" — من هنا يضيف المستخدم مهنته لملفه فيصير قابلاً للإيجاد
/// حين يسأل أحد عن "أقرب دهان"، ومن هنا يعدّلها أو يوقفها أو يشيلها.
///
/// ترجع true إذا حُفظ تغيير، عشان تعرف ورقة الحساب أنها تحتاج تعيد العرض.
Future<bool> showProfessionSheet(BuildContext context) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: RicoColors.ink.withValues(alpha: 0.42),
    builder: (_) => const ProfessionSheet(),
  );
  return result ?? false;
}

class ProfessionSheet extends StatefulWidget {
  const ProfessionSheet({super.key});

  @override
  State<ProfessionSheet> createState() => _ProfessionSheetState();
}

class _ProfessionSheetState extends State<ProfessionSheet> {
  final _headlineController = TextEditingController();
  final LocationService _locationService = LocationService();
  final ProfessionalsService _professionalsService = ProfessionalsService();

  /// القائمة المعروضة في المنتقي: من الخادم إن وصلت، وإلا النسخة المحلية —
  /// عشان مهنة أُضيفت بعد إصدار التطبيق تظهر بلا تحديث.
  List<Profession> _professions = ProfessionCatalog.all;
  List<ProfessionGroup> _groups = ProfessionCatalog.groups;

  String? _profession;
  double? _lat;
  double? _lng;
  double _radiusKm = 15;
  bool _isAvailable = true;

  bool _busy = false;
  bool _locating = false;
  String? _error;

  /// هل كان للمستخدم ملف مهني قبل فتح الورقة؟ يفرّق بين "أضف مهنتك" و"عدّل".
  late final bool _hadProfile;

  @override
  void initState() {
    super.initState();
    final existing = AuthStore.instance.customer?.professional;
    _hadProfile = existing != null;
    if (existing != null) {
      _profession = existing.profession;
      _headlineController.text = existing.headline ?? '';
      _lat = existing.lat;
      _lng = existing.lng;
      _radiusKm = (existing.serviceRadiusMeters / 1000).clamp(1, 100).toDouble();
      _isAvailable = existing.isAvailable;
    }
    _loadProfessions();
  }

  @override
  void dispose() {
    _headlineController.dispose();
    super.dispose();
  }

  Future<void> _loadProfessions() async {
    try {
      final fetched = await _professionalsService.fetchProfessions();
      if (!mounted || fetched.professions.isEmpty) return;
      setState(() {
        _professions = fetched.professions;
        // خادم بلا أقسام (أقدم من التجميع): نبقي أقسامنا المحلية بدل ما
        // نفرّغها ونطلّع قائمة مسطّحة بلا عناوين.
        if (fetched.groups.isNotEmpty) _groups = fetched.groups;
      });
    } catch (_) {
      // النسخة المحلية كافية تماماً — لا داعي لإزعاج المستخدم برسالة.
    }
  }

  Future<void> _pickProfession() async {
    final picked = await showProfessionPicker(
      context,
      professions: _professions,
      groups: _groups,
      selectedSlug: _profession,
    );
    if (picked == null || !mounted) return;
    setState(() {
      _profession = picked.slug;
      _error = null;
    });
  }

  /// اسم المهنة المختارة من القائمة المعروضة (قد تكون من الخادم)، ويسقط على
  /// الجدول المحلي — فمهنة أُضيفت بعد هذي النسخة تظهر باسمها الصحيح.
  String? get _selectedLabel {
    final slug = _profession;
    if (slug == null) return null;
    for (final p in _professions) {
      if (p.slug == slug) return p.label;
    }
    return ProfessionCatalog.labelFor(slug);
  }

  /// موقع الخدمة يُلتقط مرة ويُحفظ، ما هو GPS حيّ: موضع جوال الدهان الساعة
  /// ١١ بالليل ما يقول شي عن وين يشتغل.
  Future<void> _useCurrentLocation() async {
    if (_locating) return;
    setState(() {
      _locating = true;
      _error = null;
    });
    try {
      final position = await _locationService.getCurrentLocation();
      if (!mounted) return;
      setState(() {
        _lat = position.latitude;
        _lng = position.longitude;
      });
    } on LocationException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'ما قدرت أحدّد موقعك، حاول مرة ثانية.');
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _save() async {
    final profession = _profession;
    final lat = _lat;
    final lng = _lng;

    if (profession == null) {
      setState(() => _error = 'اختر مهنتك أول.');
      return;
    }
    if (lat == null || lng == null) {
      setState(() => _error = 'حدّد موقع شغلك عشان نعرف مين قريب منك.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await AuthStore.instance.updateProfile(
        professional: ProfessionalUpdate(
          profession: profession,
          headline: _headlineController.text,
          lat: lat,
          lng: lng,
          serviceRadiusMeters: (_radiusKm * 1000).round(),
          isAvailable: _isAvailable,
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'ما قدرت أحفظ مهنتك، حاول مرة ثانية.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: RicoColors.surface,
        shape: const RoundedRectangleBorder(borderRadius: RicoRadii.cardR),
        title: const Text('شيل مهنتك', style: RicoText.title),
        content: Text(
          'ما بتظهر لأحد يدوّر على مهنتك بعدها. حسابك وطلباتك السابقة تبقى كما هي.',
          style: RicoText.body.copyWith(height: 1.6),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('رجوع')),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: TextButton.styleFrom(foregroundColor: RicoColors.danger),
            child: const Text('شيلها'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AuthStore.instance.updateProfile(clearProfessional: true);
      if (mounted) Navigator.of(context).pop(true);
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'ما قدرت أشيل مهنتك، حاول مرة ثانية.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasLocation = _lat != null && _lng != null;

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
                    Expanded(
                      child: Text(
                        _hadProfile ? 'مهنتي' : 'أضف مهنتك',
                        style: RicoText.display.copyWith(fontSize: 19),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      icon: const Icon(Icons.close_rounded, size: 20),
                      tooltip: 'إغلاق',
                      style: IconButton.styleFrom(foregroundColor: RicoColors.inkMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'لما أحد يسأل عن أقرب ${_selectedLabel ?? 'صاحب مهنة'}، '
                  'تظهر له باسمك ومهنتك وبعدك عنه — بلا رقمك، هو اللي يرسل لك طلب وأنت تتصل فيه.',
                  style: RicoText.caption.copyWith(height: 1.65),
                ),
                const SizedBox(height: 16),

                const _Label('المهنة'),
                // زر يفتح منتقياً بالبحث والأقسام، لا قائمة منسدلة: القائمة
                // بالمئات، ومنسدلة بهذا الطول ما تُتصفّح.
                InkWell(
                  onTap: _busy ? null : _pickProfession,
                  borderRadius: RicoRadii.controlR,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 14),
                    decoration: BoxDecoration(
                      color: RicoColors.surface,
                      borderRadius: RicoRadii.controlR,
                      border: Border.all(
                        color: _profession == null ? RicoColors.hairline : RicoColors.primaryTintStrong,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.engineering_rounded,
                          size: 19,
                          color: _profession == null ? RicoColors.inkFaint : RicoColors.primary,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _selectedLabel ?? 'اختر مهنتك',
                            style: _profession == null
                                ? RicoText.body.copyWith(color: RicoColors.inkFaint)
                                : RicoText.bodyStrong.copyWith(color: RicoColors.ink),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const Icon(Icons.unfold_more_rounded, size: 18, color: RicoColors.inkMuted),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),

                const _Label('وصف شغلك (اختياري)'),
                TextField(
                  controller: _headlineController,
                  enabled: !_busy,
                  maxLength: 120,
                  maxLines: 2,
                  style: RicoText.body.copyWith(color: RicoColors.ink),
                  decoration: const InputDecoration(
                    hintText: 'مثال: دهانات داخلية وديكورات، خبرة ١٠ سنوات',
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 14),

                const _Label('موقع شغلك'),
                Container(
                  padding: const EdgeInsets.all(13),
                  decoration: BoxDecoration(
                    color: RicoColors.surface,
                    borderRadius: RicoRadii.cardR,
                    border: Border.all(color: RicoColors.hairline),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        hasLocation ? Icons.check_circle_rounded : Icons.location_off_rounded,
                        size: 18,
                        color: hasLocation ? RicoColors.success : RicoColors.inkFaint,
                      ),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Text(
                          hasLocation ? 'موقعك محفوظ ✅' : 'ما حدّدت موقعك بعد',
                          style: RicoText.caption,
                        ),
                      ),
                      TextButton(
                        onPressed: _busy || _locating ? null : _useCurrentLocation,
                        child: Text(_locating
                            ? 'جارٍ التحديد…'
                            : hasLocation
                                ? 'حدّثه'
                                : 'استخدم موقعي'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                _Label('لين وين تروح؟ ${_radiusKm.round()} كم'),
                Slider(
                  value: _radiusKm,
                  min: 1,
                  max: 100,
                  divisions: 99,
                  label: '${_radiusKm.round()} كم',
                  onChanged: _busy ? null : (value) => setState(() => _radiusKm = value),
                ),
                Text(
                  'ما تظهر لأحد أبعد من هالمسافة — عشان ما يوصلك طلب ما تقدر تلحق عليه.',
                  style: RicoText.caption.copyWith(color: RicoColors.inkFaint, height: 1.6),
                ),
                const SizedBox(height: 10),

                SwitchListTile.adaptive(
                  value: _isAvailable,
                  onChanged: _busy ? null : (value) => setState(() => _isAvailable = value),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('متاح للطلبات', style: RicoText.labelStrong),
                  subtitle: Text(
                    _isAvailable ? 'تظهر في نتائج البحث' : 'مخفي مؤقتاً، ومهنتك محفوظة',
                    style: RicoText.caption,
                  ),
                ),

                if (_error != null) ...[
                  const SizedBox(height: 10),
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
                ElevatedButton(
                  onPressed: _busy ? null : _save,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(_hadProfile ? 'احفظ التعديل' : 'احفظ مهنتي'),
                ),
                if (_hadProfile) ...[
                  const SizedBox(height: 6),
                  TextButton.icon(
                    onPressed: _busy ? null : _remove,
                    icon: const Icon(Icons.delete_outline_rounded, size: 18),
                    label: const Text('شيل مهنتي'),
                    style: TextButton.styleFrom(foregroundColor: RicoColors.danger),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;

  const _Label(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Text(text, style: RicoText.labelStrong),
    );
  }
}
