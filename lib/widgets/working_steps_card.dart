import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';
import 'typing_dots.dart';

/// بطاقة "ريكو يشتغل الحين…" — محاكاة بصرية لتقدّم البحث أثناء انتظار
/// النتيجة الفعلية. الرسالة كاملة تُستبدل بالنتائج الحقيقية فور وصولها، لذا
/// هذه البطاقة مؤقتة بحتة ولا تدّعي أرقاماً غير معروفة فعلياً (مثل عدد
/// الأماكن المفحوصة) — الخطوات نصوص عامة صحيحة دائماً.
class WorkingStepsCard extends StatefulWidget {
  final String searchLabel;

  const WorkingStepsCard({super.key, required this.searchLabel});

  @override
  State<WorkingStepsCard> createState() => _WorkingStepsCardState();
}

class _WorkingStepsCardState extends State<WorkingStepsCard> {
  static const _stepDelay = Duration(milliseconds: 900);
  int _step = 0;
  Timer? _timer;

  late final List<String> _steps = [
    'حدّدت موقعك',
    'أفحص ${widget.searchLabel} القريبة',
    'أقارن الأسعار والتقييمات',
    'أجهّز لك أفضل الخيارات',
  ];

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(_stepDelay, (timer) {
      if (!mounted) return;
      if (_step >= _steps.length - 1) {
        timer.cancel();
        return;
      }
      setState(() => _step++);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RicoCard(
      padding: const EdgeInsets.all(13),
      shadow: RicoShadows.subtle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Text('ريكو يشتغل الحين', style: RicoText.labelStrong),
              SizedBox(width: 8),
              TypingDots(dotSize: 5),
            ],
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < _steps.length; i++) _stepRow(i),
        ],
      ),
    );
  }

  Widget _stepRow(int i) {
    final done = i < _step;
    final active = i == _step;
    final isLast = i == _steps.length - 1;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // عمود المؤشرات موصول بخط رأسي — يقرأ كخط زمني لا كقائمة نقاط.
        Column(
          children: [
            _stepIcon(done: done, active: active),
            if (!isLast)
              Container(
                width: 1.5,
                height: 16,
                margin: const EdgeInsets.symmetric(vertical: 2),
                color: done ? RicoColors.primaryTintStrong : RicoColors.hairline,
              ),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Text(
              _steps[i],
              style: RicoText.label.copyWith(
                color: done
                    ? RicoColors.inkBody
                    : (active ? RicoColors.ink : RicoColors.inkFaint),
                fontWeight: active ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _stepIcon({required bool done, required bool active}) {
    if (done) {
      return Container(
        width: 18,
        height: 18,
        alignment: Alignment.center,
        decoration: const BoxDecoration(color: RicoColors.primaryTint, shape: BoxShape.circle),
        child: const Icon(Icons.check_rounded, size: 12, color: RicoColors.primary),
      );
    }
    if (active) {
      return const SizedBox(
        width: 18,
        height: 18,
        child: Padding(
          padding: EdgeInsets.all(1),
          child: CircularProgressIndicator(strokeWidth: 2, color: RicoColors.primary),
        ),
      );
    }
    return Container(
      width: 18,
      height: 18,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: RicoColors.hairlineStrong, width: 1.5),
      ),
    );
  }
}
