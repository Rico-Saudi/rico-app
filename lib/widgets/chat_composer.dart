import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:record/record.dart';
import '../services/voice_recording_service.dart';
import '../theme/app_theme.dart';

/// حقل كتابة الرسالة — حبة بيضاء مرفوعة عن الأرضية العاجية، وزر إرسال يتلوّن
/// بالأخضر فقط حين يوجد نص فعلي (وحلقة تحميل مكانه أثناء الإرسال)، فيكون
/// حال الزر انعكاساً صادقاً لما يمكن فعله الآن.
class ChatComposer extends StatefulWidget {
  final TextEditingController controller;
  final VoidCallback onSend;

  /// جارٍ تنفيذ طلب — يُعطّل الإرسال ويُظهر مؤشر تقدّم مكان السهم.
  final bool busy;

  /// شريط الاقتراحات الأفقي، يُخفى تلقائياً أثناء الكتابة.
  final Widget? suggestions;

  /// انتهى تسجيل صوتي صالح — المسار جاهز للتحويل إلى نص.
  final void Function(String filePath) onRecorded;

  /// رُفض إذن المايكروفون (أو تعذّر تشغيله) — الشاشة تتكفّل برسالة المستخدم.
  final VoidCallback onMicUnavailable;

  /// الحقل يحمل الآن نص رسالة سابقة يعاد كتابتها — يظهر شريط تعريفي فوقه
  /// عشان المستخدم ما يظن إنه يكتب رسالة جديدة.
  final bool editing;

  /// تراجع عن التعديل — يرجّع الحقل فاضياً وما يمسّ المحادثة.
  final VoidCallback onCancelEdit;

  const ChatComposer({
    super.key,
    required this.controller,
    required this.onSend,
    required this.busy,
    required this.onRecorded,
    required this.onMicUnavailable,
    this.editing = false,
    required this.onCancelEdit,
    this.suggestions,
  });

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  final FocusNode _focusNode = FocusNode();
  final VoiceRecordingService _voice = VoiceRecordingService();
  bool _hasText = false;

  /// حالة التسجيل الصوتي — أثناءه يُستبدل حقل الكتابة بشريط التسجيل بالكامل.
  bool _recording = false;
  Duration _elapsed = Duration.zero;
  Timer? _ticker;
  StreamSubscription<Amplitude>? _amplitudeSub;

  /// آخر قيم السعة كنِسب ٠-١ للعرض كأعمدة — ذاكرة قصيرة متدحرجة، تُقرأ
  /// كموجة تتحرك مع الصوت لا كمؤشر تحميل عام.
  final List<double> _levels = [];
  static const int _levelCount = 22;

  @override
  void initState() {
    super.initState();
    _hasText = widget.controller.text.trim().isNotEmpty;
    widget.controller.addListener(_onTextChanged);
  }

  @override
  void didUpdateWidget(covariant ChatComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    // فتح التعديل يفتح لوحة المفاتيح مباشرة: المستخدم ضغط «تعديل» عشان
    // يكتب، فتركه يضغط الحقل ضغطة ثانية عمل زايد بلا سبب.
    if (widget.editing && !oldWidget.editing) {
      if (_recording) unawaited(_cancelRecording());
      _focusNode.requestFocus();
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTextChanged);
    _ticker?.cancel();
    _amplitudeSub?.cancel();
    _voice.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    final hasText = widget.controller.text.trim().isNotEmpty;
    if (hasText != _hasText) setState(() => _hasText = hasText);
  }

  bool get _canSend => _hasText && !widget.busy;

  // ——— التسجيل الصوتي ———

  Future<void> _startRecording() async {
    if (_recording || widget.busy) return;

    // لوحة المفاتيح تزاحم شريط التسجيل على شاشة صغيرة، وما لها داعي أصلاً.
    _focusNode.unfocus();

    if (!await _voice.start()) {
      widget.onMicUnavailable();
      return;
    }
    if (!mounted) {
      await _voice.cancel();
      return;
    }

    setState(() {
      _recording = true;
      _elapsed = Duration.zero;
      _levels.clear();
    });

    _ticker = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (!mounted) return;
      final next = _elapsed + const Duration(milliseconds: 200);
      // السقف يُفرض هنا لا بالخادم: نوقف التسجيل تلقائياً عند الحد الأقصى
      // بدل ما نترك المستخدم يسجّل ثم نرفض له الرفع.
      if (next >= VoiceRecordingService.maxDuration) {
        setState(() => _elapsed = VoiceRecordingService.maxDuration);
        _stopRecording();
        return;
      }
      setState(() => _elapsed = next);
    });

    _amplitudeSub = _voice.amplitudeStream().listen((amp) {
      if (!mounted) return;
      // dBFS: الصمت قرب ١٦٠- والكلام العادي بين ٤٥- و٥-. نُسقط النطاق
      // المفيد على ٠-١ عشان الأعمدة تتحرك فعلاً بدل ما تبقى ملتصقة بالقاع.
      final level = ((amp.current + 45) / 45).clamp(0.0, 1.0);
      setState(() {
        _levels.add(level);
        if (_levels.length > _levelCount) _levels.removeAt(0);
      });
    });
  }

  Future<void> _stopRecording() async {
    if (!_recording) return;
    final elapsed = _elapsed;
    _endRecordingUi();

    final path = await _voice.stop();
    if (path == null) return;

    // ضغطة عرضية لا كلام: نحذف بصمت بدل ما نصرف نداء تحويل على مقطع فاضي
    // أو نطلع للمستخدم رسالة خطأ على شي ما قصده أصلاً.
    if (elapsed < VoiceRecordingService.minDuration) {
      await VoiceRecordingService.deleteFile(path);
      return;
    }

    widget.onRecorded(path);
  }

  Future<void> _cancelRecording() async {
    if (!_recording) return;
    _endRecordingUi();
    await _voice.cancel();
  }

  void _endRecordingUi() {
    _ticker?.cancel();
    _ticker = null;
    _amplitudeSub?.cancel();
    _amplitudeSub = null;
    if (mounted) setState(() => _recording = false);
  }

  @override
  Widget build(BuildContext context) {
    final suggestions = widget.suggestions;

    return Container(
      decoration: const BoxDecoration(
        color: RicoColors.canvas,
        border: Border(top: BorderSide(color: RicoColors.hairline)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // شريط الاقتراحات يختفي بمجرد بدء الكتابة — النص الذي يكتبه
            // المستخدم أولى بالمساحة من اقتراحات لم يطلبها.
            if (suggestions != null)
              AnimatedSize(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                child: _hasText || _recording ? const SizedBox(width: double.infinity) : suggestions,
              ),
            if (widget.editing) _EditingBanner(onCancel: widget.onCancelEdit),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: _recording
                        ? _RecordingBar(
                            elapsed: _elapsed,
                            levels: _levels,
                            onCancel: _cancelRecording,
                          )
                        : Container(
                            decoration: BoxDecoration(
                              color: RicoColors.surface,
                              borderRadius: BorderRadius.circular(RicoRadii.composer),
                              border: Border.all(
                                color: _focusNode.hasFocus
                                    ? RicoColors.primary.withValues(alpha: 0.5)
                                    : RicoColors.hairlineStrong,
                              ),
                              boxShadow: RicoShadows.subtle,
                            ),
                            child: TextField(
                              controller: widget.controller,
                              focusNode: _focusNode,
                              // إعادة البناء عند التركيز/فقده لتلوين حافة الحبة.
                              onTapOutside: (_) => setState(() => _focusNode.unfocus()),
                              onTap: () => setState(() {}),
                              style: RicoText.body.copyWith(color: RicoColors.ink),
                              cursorColor: RicoColors.primary,
                              maxLines: 4,
                              minLines: 1,
                              textInputAction: TextInputAction.send,
                              keyboardType: TextInputType.multiline,
                              onSubmitted: (_) => _canSend ? widget.onSend() : null,
                              decoration: InputDecoration(
                                isDense: true,
                                hintText: widget.editing ? 'عدّل رسالتك…' : 'اكتب طلبك… مثل «أقرب مطعم»',
                                hintStyle: RicoText.body.copyWith(color: RicoColors.inkFaint),
                                filled: false,
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
                              ),
                            ),
                          ),
                  ),
                  const SizedBox(width: 8),
                  // زر واحد بثلاث حالات بدل زرين متجاورين: مايك حين لا نص،
                  // إيقاف أثناء التسجيل، وإرسال حين يوجد نص فعلاً — فيبقى
                  // الزر انعكاساً صادقاً للفعل الوحيد المتاح الآن.
                  if (_recording)
                    _CircleButton(
                      semanticLabel: 'إيقاف التسجيل',
                      icon: Icons.stop_rounded,
                      onTap: _stopRecording,
                      filled: true,
                    )
                  else if (_hasText || widget.busy || widget.editing)
                    _SendButton(enabled: _canSend, busy: widget.busy, onTap: widget.onSend)
                  else
                    _CircleButton(
                      semanticLabel: 'تسجيل صوتي',
                      icon: Icons.mic_rounded,
                      onTap: _startRecording,
                      filled: true,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// شريط «تعديل رسالتك» فوق حقل الكتابة — يقول صراحةً إن الإرسال سيمسح الرد
/// القديم، لأن الحذف يصير عند الإرسال لا عند فتح التعديل، والمستخدم يستحق
/// يعرف قبل ما يضغط.
class _EditingBanner extends StatelessWidget {
  final VoidCallback onCancel;

  const _EditingBanner({required this.onCancel});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsetsDirectional.only(start: 16, end: 6, top: 6, bottom: 2),
      child: Row(
        children: [
          const Icon(Icons.edit_rounded, size: 15, color: RicoColors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'تعديل رسالتك — الرد القديم بينحذف',
              style: RicoText.label.copyWith(color: RicoColors.inkMuted),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Semantics(
            button: true,
            label: 'إلغاء التعديل',
            child: IconButton(
              onPressed: onCancel,
              icon: const Icon(Icons.close_rounded, size: 18, color: RicoColors.inkMuted),
              splashRadius: 18,
              visualDensity: VisualDensity.compact,
            ),
          ),
        ],
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  final bool enabled;
  final bool busy;
  final VoidCallback onTap;

  const _SendButton({required this.enabled, required this.busy, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'إرسال',
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: 48,
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: enabled
                ? const LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [RicoColors.primaryLift, RicoColors.primaryDeep],
                  )
                : null,
            color: enabled ? null : RicoColors.surfaceSunken,
            shape: BoxShape.circle,
            boxShadow: enabled ? RicoShadows.brand : const [],
          ),
          child: busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: RicoColors.inkFaint),
                )
              // الأيقونة مرآة تلقائياً في RTL فتشير لجهة الكتابة الصحيحة.
              : Icon(
                  Icons.send_rounded,
                  size: 20,
                  color: enabled ? Colors.white : RicoColors.inkFaint,
                ),
        ),
      ),
    );
  }
}

/// شريط التسجيل — يحل محل حقل الكتابة أثناء التسجيل بنفس المقاس والحواف،
/// فما يقفز التخطيط. يعرض نقطة حمراء نابضة، مؤقّتاً، موجة سعة حيّة، وزر
/// إلغاء يرمي التسجيل بلا تحويل.
class _RecordingBar extends StatelessWidget {
  final Duration elapsed;
  final List<double> levels;
  final VoidCallback onCancel;

  const _RecordingBar({required this.elapsed, required this.levels, required this.onCancel});

  String get _timeLabel {
    final seconds = elapsed.inSeconds;
    final remaining = VoiceRecordingService.maxDuration.inSeconds - seconds;
    final text = '0:${seconds.toString().padLeft(2, '0')}';
    // آخر ١٠ ثوانٍ: نعرض العدّ التنازلي بعد المؤقّت عشان يبان إن فيه سقف
    // قادم بدل ما يتوقف التسجيل فجأة بلا سابق إنذار.
    return remaining <= 10 ? '$text · باقي $remaining ث' : text;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      padding: const EdgeInsetsDirectional.only(start: 14, end: 6),
      decoration: BoxDecoration(
        color: RicoColors.surface,
        borderRadius: BorderRadius.circular(RicoRadii.composer),
        border: Border.all(color: RicoColors.danger.withValues(alpha: 0.45)),
        boxShadow: RicoShadows.subtle,
      ),
      child: Row(
        children: [
          const _PulsingDot(),
          const SizedBox(width: 10),
          Text(
            _timeLabel,
            style: RicoText.label.copyWith(
              color: RicoColors.inkBody,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: _LevelBars(levels: levels)),
          Semantics(
            button: true,
            label: 'إلغاء التسجيل',
            child: IconButton(
              onPressed: onCancel,
              icon: const Icon(Icons.close_rounded, size: 20, color: RicoColors.inkMuted),
              splashRadius: 20,
            ),
          ),
        ],
      ),
    );
  }
}

/// نقطة تسجيل حمراء نابضة — الإشارة المتعارف عليها إن المايك شغّال الآن.
class _PulsingDot extends StatefulWidget {
  const _PulsingDot();

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 1, end: 0.3).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: Container(
        width: 9,
        height: 9,
        decoration: const BoxDecoration(color: RicoColors.danger, shape: BoxShape.circle),
      ),
    );
  }
}

/// موجة السعة الحيّة. المقصود منها التأكيد إن الصوت يوصل فعلاً — مؤشر تحميل
/// دوّار ما يفرّق بين مايك شغّال ومايك مكتوم.
class _LevelBars extends StatelessWidget {
  final List<double> levels;

  const _LevelBars({required this.levels});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        for (var i = 0; i < levels.length; i++) ...[
          Container(
            width: 3,
            // الأقدم أخفت: يعطي إحساس الحركة لليمين مع الوقت.
            height: math.max(3, levels[i] * 22),
            decoration: BoxDecoration(
              color: RicoColors.primary.withValues(alpha: 0.35 + 0.65 * (i / math.max(1, levels.length - 1))),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          if (i != levels.length - 1) const SizedBox(width: 2),
        ],
      ],
    );
  }
}

/// زر دائري بنفس مقاس ومظهر زر الإرسال — يستخدمه المايك وزر الإيقاف عشان
/// ما يقفز التخطيط عند التبديل بينهما.
class _CircleButton extends StatelessWidget {
  final String semanticLabel;
  final IconData icon;
  final VoidCallback onTap;
  final bool filled;

  const _CircleButton({
    required this.semanticLabel,
    required this.icon,
    required this.onTap,
    required this.filled,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: 48,
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: filled
                ? const LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [RicoColors.primaryLift, RicoColors.primaryDeep],
                  )
                : null,
            color: filled ? null : RicoColors.surfaceSunken,
            shape: BoxShape.circle,
            boxShadow: filled ? RicoShadows.brand : const [],
          ),
          child: Icon(icon, size: 21, color: filled ? Colors.white : RicoColors.inkMuted),
        ),
      ),
    );
  }
}

/// شريط اقتراحات أفقي فوق حقل الكتابة — بديل عن كتلة الحبوب الثابتة التي
/// كانت تقتطع أعلى المحادثة دائماً.
class SuggestionRail extends StatelessWidget {
  final void Function(String prompt) onPick;

  const SuggestionRail({super.key, required this.onPick});

  static const List<({IconData icon, String label, String prompt})> _items = [
    (icon: Icons.restaurant_rounded, label: 'أقرب مطعم', prompt: 'أقرب مطعم'),
    (icon: Icons.local_cafe_rounded, label: 'أرخص كافيه', prompt: 'أرخص كافيه'),
    (icon: Icons.local_offer_rounded, label: 'عروض قريبة', prompt: 'وش العروض القريبة؟'),
    (icon: Icons.local_pharmacy_rounded, label: 'صيدلية', prompt: 'أقرب صيدلية'),
    (icon: Icons.local_gas_station_rounded, label: 'بنزين', prompt: 'أقرب محطة بنزين'),
    (icon: Icons.hotel_rounded, label: 'فندق', prompt: 'أقرب فندق'),
    (icon: Icons.local_grocery_store_rounded, label: 'بقالة', prompt: 'أقرب بقالة'),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final item = _items[i];
          return _RailChip(icon: item.icon, label: item.label, onTap: () => onPick(item.prompt));
        },
      ),
    );
  }
}

class _RailChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _RailChip({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RicoColors.surface,
      borderRadius: RicoRadii.pillR,
      child: InkWell(
        onTap: onTap,
        borderRadius: RicoRadii.pillR,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13),
          decoration: BoxDecoration(
            borderRadius: RicoRadii.pillR,
            border: Border.all(color: RicoColors.hairlineStrong),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 15, color: RicoColors.primary),
              const SizedBox(width: 7),
              Text(label, style: RicoText.label.copyWith(color: RicoColors.inkBody)),
            ],
          ),
        ),
      ),
    );
  }
}
