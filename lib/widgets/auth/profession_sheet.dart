import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import '../../models/business_card.dart';
import '../../models/profession.dart';
import '../../services/auth_service.dart';
import '../../services/auth_store.dart';
import '../../services/location_service.dart';
import '../../services/profession_catalog.dart';
import '../../services/professionals_service.dart';
import '../../services/transcribe_service.dart';
import '../../services/voice_recording_service.dart';
import '../../theme/app_theme.dart';
import 'business_card_preview_sheet.dart';
import 'profession_picker.dart';

/// يفتح محرّر البطاقة، وإذا حُفظ تغيير يعرض البطاقة كما صارت فعلاً — وزر
/// "عدّل" في المعاينة يرجّع للمحرّر.
///
/// الدورة كلها هنا لا عند المستدعي: "خلّصت ← شوف بطاقتك ← عدّلها" سلوك
/// واحد، ومن يفتح المحرّر (ورقة الحساب اليوم، وغيرها غداً) ما له شغل بترتيب
/// أوراقه.
///
/// يرجع true إذا حُفظ تغيير، عشان تعرف ورقة الحساب أنها تحتاج تعيد العرض.
Future<bool> showProfessionFlow(BuildContext context) async {
  var changed = false;
  while (true) {
    if (!context.mounted) return changed;
    final saved = await showProfessionSheet(context);
    changed = changed || saved;
    if (!saved || !context.mounted) return changed;

    final action = await showBusinessCardPreview(context);
    if (action != BusinessCardPreviewAction.edit) return changed;
  }
}

/// ورقة "بطاقتي المهنية" — من هنا يبنيها المستخدم فيصير قابلاً للإيجاد حين
/// يسأل أحد عن "أقرب دهان"، ومن هنا يعدّلها أو يوقفها أو يشيلها.
///
/// ترجع true إذا حُفظ تغيير.
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
  static const int _maxSkills = 8;
  static const int _maxBioLength = 600;

  final _headlineController = TextEditingController();
  final _bioController = TextEditingController();
  final _skillController = TextEditingController();
  final _yearsController = TextEditingController();

  final LocationService _locationService = LocationService();
  final ProfessionalsService _professionalsService = ProfessionalsService();
  final VoiceRecordingService _recorder = VoiceRecordingService();
  final TranscribeService _transcriber = TranscribeService();
  final ImagePicker _imagePicker = ImagePicker();

  /// القائمة المعروضة في المنتقي: من الخادم إن وصلت، وإلا النسخة المحلية —
  /// عشان مهنة يضيفها المالك من اللوحة تظهر بلا تحديث للتطبيق.
  List<Profession> _professions = ProfessionCatalog.all;
  List<ProfessionGroup> _groups = ProfessionCatalog.groups;

  String? _profession;
  final List<String> _skills = [];
  CardAccent _accent = CardAccent.green;
  double? _lat;
  double? _lng;
  double _radiusKm = 15;
  bool _isAvailable = true;

  /// الصورة المرفوعة حالياً على الخادم (مسار نسبي)، إن وُجدت.
  String? _savedPhotoPath;

  /// صورة اختارها المستخدم الحين وما رُفعت بعد — تُعرض من القرص مباشرة،
  /// فيشوف وجهه على البطاقة قبل ما يضغط "تم".
  String? _pendingPhotoPath;

  bool _photoRemoved = false;

  /// السيرة المرفقة حالياً على الخادم (اسم الملف)، إن وُجدت.
  String? _savedCvFileName;

  /// ملف اختاره المستخدم الحين وما رُفع بعد. الرفع يصير بعد نجاح حفظ
  /// البطاقة لا قبله: مسار الرفع في الخادم يشترط وجود ملف مهني، فأول مرة
  /// ما فيه شي يعلّق عليه الملف بعد.
  String? _pendingCvPath;

  /// طلب حذف السيرة المرفقة — يُطبّق عند الحفظ، فالورقة كلها صفقة واحدة:
  /// "تم" تحفظ كل شي، والخروج ما يغيّر شي.
  bool _cvRemoved = false;

  bool _busy = false;
  bool _locating = false;
  bool _recordingVoice = false;
  bool _transcribing = false;
  String? _error;

  /// هل كان للمستخدم بطاقة قبل فتح الورقة؟ يفرّق بين "أنشئ" و"عدّل".
  late final bool _hadProfile;

  @override
  void initState() {
    super.initState();
    final existing = AuthStore.instance.customer?.professional;
    _hadProfile = existing != null;
    if (existing != null) {
      _profession = existing.profession;
      _headlineController.text = existing.headline ?? '';
      _bioController.text = existing.bio ?? '';
      _skills.addAll(existing.skills);
      _yearsController.text = existing.yearsExperience?.toString() ?? '';
      _accent = existing.accent;
      _savedPhotoPath = existing.photoPath;
      _savedCvFileName = existing.cvFileName;
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
    _bioController.dispose();
    _skillController.dispose();
    _yearsController.dispose();
    _recorder.dispose();
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

  // ─── الوصف بالصوت ───────────────────────────────────────────────────────

  /// يسجّل ثم يحوّل الكلام نصاً ويضيفه لحقل "عن شغلي".
  ///
  /// موجود لأن أغلب أصحاب المهن يتكلمون عن شغلهم أسهل بكثير مما يكتبونه على
  /// لوحة مفاتيح جوال — والنص يبقى قابلاً للتحرير بعدها، فالتحويل مسودة لا
  /// حكم نهائي.
  Future<void> _toggleVoice() async {
    if (_transcribing) return;

    if (_recordingVoice) {
      setState(() {
        _recordingVoice = false;
        _transcribing = true;
      });

      final path = await _recorder.stop();
      if (path == null) {
        if (mounted) setState(() => _transcribing = false);
        return;
      }

      final result = await _transcriber.transcribe(path);
      await VoiceRecordingService.deleteFile(path);
      if (!mounted) return;

      setState(() {
        _transcribing = false;
        switch (result.status) {
          case TranscriptionStatus.ok:
            _appendToBio(result.text);
            _error = null;
          case TranscriptionStatus.noSpeech:
            _error = 'ما سمعت كلام واضح، جرّب مرة ثانية.';
          case TranscriptionStatus.failed:
            _error = 'ما قدرت أحوّل صوتك لنص، اكتبه أو جرّب بعد شوي.';
        }
      });
      return;
    }

    if (!await _recorder.hasPermission()) {
      if (mounted) setState(() => _error = 'محتاج إذن المايكروفون عشان أسجّل كلامك.');
      return;
    }
    final started = await _recorder.start();
    if (!mounted) return;
    setState(() {
      _recordingVoice = started;
      if (!started) _error = 'ما قدرت أبدأ التسجيل، جرّب مرة ثانية.';
    });
  }

  /// يضيف المحوَّل لما هو مكتوب بدل ما يستبدله: من يسجّل مرتين يقصد جملة
  /// ثانية، لا إعادة كتابة الأولى.
  void _appendToBio(String text) {
    final existing = _bioController.text.trim();
    final merged = existing.isEmpty ? text : '$existing $text';
    _bioController.text = merged.length > _maxBioLength ? merged.substring(0, _maxBioLength) : merged;
    _bioController.selection = TextSelection.collapsed(offset: _bioController.text.length);
  }

  // ─── الصورة الشخصية ─────────────────────────────────────────────────────

  /// يلتقط الصورة أو يختارها من المعرض.
  ///
  /// تُصغَّر عند الالتقاط لا عند الرفع: البطاقة ترسمها في دائرة ٤٢ بكسل،
  /// فصورة جوال بـ١٢ ميجابكسل كلها بايتات ما يشوفها أحد — ورفعها على شبكة
  /// جوال ضعيفة انتظار بلا مقابل.
  Future<void> _pickPhoto() async {
    final source = await _askImageSource(
      cameraLabel: 'صوّر نفسك الحين',
      cameraHint: 'صورة واضحة لوجهك تطمّن اللي يشوف بطاقتك',
    );
    if (source == null || !mounted) return;

    try {
      final picked = await _imagePicker.pickImage(
        source: source,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );
      if (picked == null || !mounted) return;

      setState(() {
        _pendingPhotoPath = picked.path;
        _photoRemoved = false;
        _error = null;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'ما قدرت أفتح الصورة، جرّب مرة ثانية.');
    }
  }

  /// ورقة صغيرة: كاميرا أو معرض. مشتركة بين الصورة والسيرة المصوّرة.
  Future<ImageSource?> _askImageSource({required String cameraLabel, String? cameraHint}) {
    return showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: RicoColors.canvas,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined, color: RicoColors.primary),
              title: Text(cameraLabel, style: RicoText.bodyStrong),
              subtitle: cameraHint == null ? null : Text(cameraHint, style: RicoText.caption),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: RicoColors.primary),
              title: const Text('اختر من المعرض', style: RicoText.bodyStrong),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  /// مسار الصورة المعروضة الحين: المختارة محلياً، وإلا المرفوعة على الخادم.
  ({String? localPath, String? remoteUrl}) get _photoPreview {
    if (_photoRemoved) return (localPath: null, remoteUrl: null);
    if (_pendingPhotoPath != null) return (localPath: _pendingPhotoPath, remoteUrl: null);
    return (localPath: null, remoteUrl: ProfessionalsService.fileUrl(_savedPhotoPath));
  }

  // ─── السيرة الذاتية ─────────────────────────────────────────────────────

  Future<void> _pickCv() async {
    final source = await showModalBottomSheet<_CvSource>(
      context: context,
      backgroundColor: RicoColors.canvas,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_rounded, color: RicoColors.primary),
              title: const Text('ملف PDF', style: RicoText.bodyStrong),
              onTap: () => Navigator.of(sheetContext).pop(_CvSource.file),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: RicoColors.primary),
              title: const Text('صورة من المعرض', style: RicoText.bodyStrong),
              onTap: () => Navigator.of(sheetContext).pop(_CvSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined, color: RicoColors.primary),
              title: const Text('صوّرها الحين', style: RicoText.bodyStrong),
              subtitle: const Text('لو سيرتك ورقة بيدك', style: RicoText.caption),
              onTap: () => Navigator.of(sheetContext).pop(_CvSource.camera),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    try {
      final path = switch (source) {
        _CvSource.file => await _pickPdf(),
        // السيرة المصوّرة تُصغَّر أقل من الصورة الشخصية: هذي ورقة تُقرأ، لا
        // دائرة صغيرة — تصغيرها لـ٨٠٠ بكسل يطمس السطور.
        _CvSource.gallery =>
          (await _imagePicker.pickImage(source: ImageSource.gallery, maxWidth: 2000, imageQuality: 85))?.path,
        _CvSource.camera =>
          (await _imagePicker.pickImage(source: ImageSource.camera, maxWidth: 2000, imageQuality: 85))?.path,
      };
      if (path == null || !mounted) return;

      setState(() {
        _pendingCvPath = path;
        _cvRemoved = false;
        _error = null;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'ما قدرت أفتح الملف، جرّب مرة ثانية.');
    }
  }

  Future<String?> _pickPdf() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      withData: false,
    );
    return result?.files.single.path;
  }

  /// اسم الملف المعروض: المختار الحين إن وُجد، وإلا المرفق المحفوظ.
  String? get _cvLabel {
    if (_cvRemoved) return null;
    final pending = _pendingCvPath;
    if (pending != null) return pending.split(RegExp(r'[/\\]')).last;
    return _savedCvFileName;
  }

  // ─── المهارات ───────────────────────────────────────────────────────────

  void _addSkill() {
    final skill = _skillController.text.trim();
    if (skill.isEmpty) return;
    if (_skills.length >= _maxSkills) {
      setState(() => _error = 'وصلت أقصى عدد مهارات ($_maxSkills).');
      return;
    }
    if (_skills.contains(skill)) {
      _skillController.clear();
      return;
    }
    setState(() {
      _skills.add(skill);
      _skillController.clear();
      _error = null;
    });
  }

  // ─── الحفظ ──────────────────────────────────────────────────────────────

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
          bio: _bioController.text,
          skills: _skills,
          yearsExperience: int.tryParse(_yearsController.text.trim()),
          cardAccent: _accent.slug,
          lat: lat,
          lng: lng,
          serviceRadiusMeters: (_radiusKm * 1000).round(),
          isAvailable: _isAvailable,
        ),
      );

      // الملفات بعد النص، لا قبله: مسارات الرفع تشترط وجود ملف مهني، وأول
      // بطاقة ما تصير موجودة إلا بعد هذا الحفظ.
      await _applyPhotoChange();
      await _applyCvChange();

      if (mounted) Navigator.of(context).pop(true);
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on ProfessionalsException catch (e) {
      // البطاقة نفسها حُفظت، والذي فشل هو ملف مرفق وحده — نقولها كما هي بدل
      // ما نوحي أن كل شي ضاع.
      if (mounted) setState(() => _error = '${e.message} (بقية البطاقة محفوظة)');
    } catch (_) {
      if (mounted) setState(() => _error = 'ما قدرت أحفظ بطاقتك، حاول مرة ثانية.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _applyPhotoChange() async {
    final token = AuthStore.instance.token;
    if (token == null) return;

    final pending = _pendingPhotoPath;
    if (pending != null) {
      final updated = await _professionalsService.uploadPhoto(filePath: pending, token: token);
      await AuthStore.instance.adoptCustomer(updated);
      if (mounted) {
        setState(() {
          _pendingPhotoPath = null;
          _savedPhotoPath = updated.professional?.photoPath;
        });
      }
    } else if (_photoRemoved && _savedPhotoPath != null) {
      final updated = await _professionalsService.removePhoto(token);
      await AuthStore.instance.adoptCustomer(updated);
      if (mounted) {
        setState(() {
          _photoRemoved = false;
          _savedPhotoPath = null;
        });
      }
    }
  }

  Future<void> _applyCvChange() async {
    final token = AuthStore.instance.token;
    if (token == null) return;

    final pending = _pendingCvPath;
    if (pending != null) {
      final updated = await _professionalsService.uploadCv(filePath: pending, token: token);
      await AuthStore.instance.adoptCustomer(updated);
      if (mounted) {
        setState(() {
          _pendingCvPath = null;
          _savedCvFileName = updated.professional?.cvFileName;
        });
      }
    } else if (_cvRemoved && _savedCvFileName != null) {
      final updated = await _professionalsService.removeCv(token);
      await AuthStore.instance.adoptCustomer(updated);
      if (mounted) {
        setState(() {
          _cvRemoved = false;
          _savedCvFileName = null;
        });
      }
    }
  }

  Future<void> _remove() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: RicoColors.surface,
        shape: const RoundedRectangleBorder(borderRadius: RicoRadii.cardR),
        title: const Text('شيل بطاقتك', style: RicoText.title),
        content: Text(
          'ما بتظهر لأحد يدوّر على مهنتك بعدها، وتروح بطاقتك بوصفها ومهاراتها وسيرتها. '
          'حسابك وطلباتك السابقة تبقى كما هي.',
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
      if (mounted) setState(() => _error = 'ما قدرت أشيل بطاقتك، حاول مرة ثانية.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasLocation = _lat != null && _lng != null;
    final cvLabel = _cvLabel;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: RicoColors.canvas,
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        ),
        // الورقة صارت نموذجاً طويلاً (بطاقة كاملة لا حقلين)، فتُقصّ على
        // ٩٠٪ من الشاشة وتُمرَّر بدل ما تطلع خارجها على جوال قصير.
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
                    Expanded(
                      child: Text(
                        _hadProfile ? 'بطاقتي المهنية' : 'أنشئ بطاقتك المهنية',
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
                  'تظهر له بطاقتك كاملة — بلا رقمك، هو اللي يرسل لك طلب وأنت تتصل فيه.',
                  style: RicoText.caption.copyWith(height: 1.65),
                ),
                const SizedBox(height: 16),

                const _Label('صورتك'),
                _PhotoField(
                  localPath: _photoPreview.localPath,
                  remoteUrl: _photoPreview.remoteUrl,
                  initial: AuthStore.instance.customer?.initial ?? '؟',
                  accent: _accent,
                  isPending: _pendingPhotoPath != null,
                  enabled: !_busy,
                  onPick: _pickPhoto,
                  onRemove: () => setState(() {
                    _pendingPhotoPath = null;
                    if (_savedPhotoPath != null) _photoRemoved = true;
                  }),
                ),
                const SizedBox(height: 14),

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

                const _Label('سطر تعريفي'),
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

                const _Label('عن شغلي'),
                _BioField(
                  controller: _bioController,
                  enabled: !_busy,
                  maxLength: _maxBioLength,
                  recording: _recordingVoice,
                  transcribing: _transcribing,
                  onToggleVoice: _busy ? null : _toggleVoice,
                ),
                const SizedBox(height: 14),

                const _Label('مهاراتي'),
                _SkillsField(
                  controller: _skillController,
                  skills: _skills,
                  accent: _accent,
                  enabled: !_busy,
                  onAdd: _addSkill,
                  onRemove: (skill) => setState(() => _skills.remove(skill)),
                ),
                const SizedBox(height: 14),

                const _Label('سنوات الخبرة (اختياري)'),
                TextField(
                  controller: _yearsController,
                  enabled: !_busy,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(2)],
                  style: RicoText.body.copyWith(color: RicoColors.ink),
                  decoration: const InputDecoration(hintText: 'مثال: ١٠'),
                ),
                const SizedBox(height: 14),

                const _Label('السيرة الذاتية (اختياري)'),
                _CvField(
                  fileName: cvLabel,
                  isPending: _pendingCvPath != null,
                  enabled: !_busy,
                  onPick: _pickCv,
                  onRemove: () => setState(() {
                    _pendingCvPath = null;
                    if (_savedCvFileName != null) _cvRemoved = true;
                  }),
                ),
                const SizedBox(height: 14),

                const _Label('لون البطاقة'),
                _AccentPicker(
                  selected: _accent,
                  enabled: !_busy,
                  onSelect: (accent) => setState(() => _accent = accent),
                ),
                const SizedBox(height: 16),

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
                    _isAvailable ? 'بطاقتك تظهر في نتائج البحث' : 'مخفية مؤقتاً، وبطاقتك محفوظة',
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
                      : Text(_hadProfile ? 'تم' : 'أنشئ البطاقة'),
                ),
                if (_hadProfile) ...[
                  const SizedBox(height: 6),
                  TextButton.icon(
                    onPressed: _busy ? null : _remove,
                    icon: const Icon(Icons.delete_outline_rounded, size: 18),
                    label: const Text('شيل بطاقتي'),
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

enum _CvSource { file, gallery, camera }

/// حقل "عن شغلي" ومعه زر التسجيل — الزر داخل الحقل لا تحته عشان يكون
/// الإملاء بديلاً ظاهراً للكتابة، لا ميزة مخفية.
class _BioField extends StatelessWidget {
  final TextEditingController controller;
  final bool enabled;
  final int maxLength;
  final bool recording;
  final bool transcribing;
  final VoidCallback? onToggleVoice;

  const _BioField({
    required this.controller,
    required this.enabled,
    required this.maxLength,
    required this.recording,
    required this.transcribing,
    this.onToggleVoice,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          enabled: enabled && !recording && !transcribing,
          maxLength: maxLength,
          maxLines: 5,
          minLines: 3,
          style: RicoText.body.copyWith(color: RicoColors.ink, height: 1.7),
          decoration: const InputDecoration(
            hintText: 'احكِ عن شغلك: وش تسوي بالضبط، كيف تشتغل، وش سويت قبل.',
            counterText: '',
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            OutlinedButton.icon(
              onPressed: onToggleVoice,
              icon: Icon(
                recording ? Icons.stop_rounded : Icons.mic_rounded,
                size: 17,
                color: recording ? RicoColors.danger : RicoColors.primary,
              ),
              label: Text(
                transcribing
                    ? 'جارٍ التحويل…'
                    : recording
                        ? 'خلصت'
                        : 'سجّل بصوتك',
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: recording ? RicoColors.danger : RicoColors.primary,
                minimumSize: const Size(0, 38),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                recording ? 'أسمعك… اضغط "خلصت" لما تكمّل.' : 'أسهل من الكتابة — نحوّل كلامك نصاً وتقدر تعدّله.',
                style: RicoText.overline.copyWith(color: RicoColors.inkMuted, height: 1.5),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// وسوم المهارات: حقل صغير + زر إضافة، والوسوم تحته بزر حذف على كل وحدة.
class _SkillsField extends StatelessWidget {
  final TextEditingController controller;
  final List<String> skills;
  final CardAccent accent;
  final bool enabled;
  final VoidCallback onAdd;
  final void Function(String skill) onRemove;

  const _SkillsField({
    required this.controller,
    required this.skills,
    required this.accent,
    required this.enabled,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                enabled: enabled,
                maxLength: 24,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => onAdd(),
                style: RicoText.body.copyWith(color: RicoColors.ink),
                decoration: const InputDecoration(hintText: 'مثال: ورق جدران', counterText: ''),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              onPressed: enabled ? onAdd : null,
              icon: const Icon(Icons.add_rounded, size: 20),
              tooltip: 'أضف مهارة',
            ),
          ],
        ),
        if (skills.isNotEmpty) ...[
          const SizedBox(height: 9),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final skill in skills)
                Container(
                  padding: const EdgeInsetsDirectional.fromSTEB(10, 5, 5, 5),
                  decoration: BoxDecoration(
                    color: accent.tint,
                    borderRadius: RicoRadii.pillR,
                    border: Border.all(color: accent.bottom.withValues(alpha: 0.16)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        skill,
                        style: RicoText.caption.copyWith(color: accent.bottom, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(width: 3),
                      InkWell(
                        onTap: enabled ? () => onRemove(skill) : null,
                        borderRadius: RicoRadii.pillR,
                        child: Padding(
                          padding: const EdgeInsets.all(2),
                          child: Icon(Icons.close_rounded, size: 14, color: accent.bottom),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

/// صورتك على البطاقة: معاينة دائرية بنفس مقاس البطاقة تقريباً، وزر يبدّلها.
///
/// المعاينة من القرص مباشرة للصورة المختارة الحين — يشوف وجهه قبل ما يرفع،
/// فما ينتظر رفعاً ليكتشف أنه اختار الصورة الغلط.
class _PhotoField extends StatelessWidget {
  /// صورة اختيرت الحين وما رُفعت بعد (مسار على الجهاز).
  final String? localPath;

  /// الصورة المرفوعة على الخادم (رابط مطلق).
  final String? remoteUrl;

  /// حرف الاسم — ما يُرسم حين ما فيه صورة، تماماً كما ترسمه البطاقة.
  final String initial;

  final CardAccent accent;
  final bool isPending;
  final bool enabled;
  final VoidCallback onPick;
  final VoidCallback onRemove;

  const _PhotoField({
    required this.localPath,
    required this.remoteUrl,
    required this.initial,
    required this.accent,
    required this.isPending,
    required this.enabled,
    required this.onPick,
    required this.onRemove,
  });

  bool get _hasPhoto => localPath != null || remoteUrl != null;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RicoColors.surface,
        borderRadius: RicoRadii.cardR,
        border: Border.all(color: RicoColors.hairline),
      ),
      child: Row(
        children: [
          InkWell(
            onTap: enabled ? onPick : null,
            customBorder: const CircleBorder(),
            child: Container(
              width: 62,
              height: 62,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: accent.tint,
                border: Border.all(color: accent.bottom.withValues(alpha: 0.22), width: 2),
              ),
              child: ClipOval(child: _face()),
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _hasPhoto ? 'صورتك على البطاقة' : 'بلا صورة',
                  style: RicoText.labelStrong,
                ),
                const SizedBox(height: 3),
                Text(
                  isPending
                      ? 'تُرفع لما تضغط تم'
                      : _hasPhoto
                          ? 'تظهر لكل من يشوف بطاقتك'
                          : 'بطاقتك تعرض حرف اسمك — صورتك تخليها تطمّن أكثر',
                  style: RicoText.overline.copyWith(color: RicoColors.inkMuted, height: 1.5),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    TextButton(
                      onPressed: enabled ? onPick : null,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        minimumSize: const Size(0, 32),
                      ),
                      child: Text(_hasPhoto ? 'بدّلها' : 'أضف صورة'),
                    ),
                    if (_hasPhoto)
                      TextButton(
                        onPressed: enabled ? onRemove : null,
                        style: TextButton.styleFrom(
                          foregroundColor: RicoColors.danger,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          minimumSize: const Size(0, 32),
                        ),
                        child: const Text('شيلها'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _face() {
    final local = localPath;
    if (local != null) {
      return Image.file(File(local), width: 62, height: 62, fit: BoxFit.cover);
    }

    final remote = remoteUrl;
    if (remote != null) {
      return CachedNetworkImage(
        imageUrl: remote,
        width: 62,
        height: 62,
        fit: BoxFit.cover,
        placeholder: (_, __) => _initialFace(),
        errorWidget: (_, __, ___) => _initialFace(),
      );
    }

    return _initialFace();
  }

  Widget _initialFace() => Container(
        alignment: Alignment.center,
        color: accent.tint,
        child: Text(initial, style: RicoText.display.copyWith(color: accent.bottom, fontSize: 24)),
      );
}

class _CvField extends StatelessWidget {
  final String? fileName;

  /// ملف اختير الحين وما رُفع بعد — يُقال صراحة عشان ما يظن المستخدم أن
  /// إغلاق الورقة بلا حفظ يكفي.
  final bool isPending;

  final bool enabled;
  final VoidCallback onPick;
  final VoidCallback onRemove;

  const _CvField({
    required this.fileName,
    required this.isPending,
    required this.enabled,
    required this.onPick,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final name = fileName;

    if (name == null) {
      return OutlinedButton.icon(
        onPressed: enabled ? onPick : null,
        icon: const Icon(Icons.attach_file_rounded, size: 17),
        label: const Text('أرفق سيرتك (PDF أو صورة)'),
        style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
      );
    }

    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: RicoColors.surface,
        borderRadius: RicoRadii.cardR,
        border: Border.all(color: RicoColors.hairline),
      ),
      child: Row(
        children: [
          const Icon(Icons.description_outlined, size: 18, color: RicoColors.primary),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(name, style: RicoText.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                if (isPending)
                  Text(
                    'يُرفع لما تضغط تم',
                    style: RicoText.overline.copyWith(color: RicoColors.inkMuted),
                  ),
              ],
            ),
          ),
          TextButton(onPressed: enabled ? onPick : null, child: const Text('بدّل')),
          IconButton(
            onPressed: enabled ? onRemove : null,
            icon: const Icon(Icons.delete_outline_rounded, size: 19),
            tooltip: 'شيل السيرة',
            style: IconButton.styleFrom(foregroundColor: RicoColors.danger),
          ),
        ],
      ),
    );
  }
}

/// منتقي لون البطاقة — أربع دوائر بتدرّجاتها الحقيقية، فما يحتاج المستخدم
/// يتخيّل وش يعني "ليلي".
class _AccentPicker extends StatelessWidget {
  final CardAccent selected;
  final bool enabled;
  final void Function(CardAccent accent) onSelect;

  const _AccentPicker({required this.selected, required this.enabled, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final accent in CardAccent.values) ...[
          Expanded(
            child: InkWell(
              onTap: enabled ? () => onSelect(accent) : null,
              borderRadius: RicoRadii.controlR,
              child: Column(
                children: [
                  Container(
                    height: 38,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: AlignmentDirectional.topStart,
                        end: AlignmentDirectional.bottomEnd,
                        colors: [accent.top, accent.bottom],
                      ),
                      borderRadius: RicoRadii.controlR,
                      border: Border.all(
                        color: accent == selected ? RicoColors.ink : Colors.transparent,
                        width: 2,
                      ),
                    ),
                    child: accent == selected
                        ? const Icon(Icons.check_rounded, size: 18, color: Colors.white)
                        : null,
                  ),
                  const SizedBox(height: 4),
                  Text(accent.label, style: RicoText.overline.copyWith(color: RicoColors.inkMuted)),
                ],
              ),
            ),
          ),
          if (accent != CardAccent.values.last) const SizedBox(width: 8),
        ],
      ],
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
