import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// ثلاث نقاط تتحرك موجياً — مؤشر "ريكو يكتب" المتعارف عليه في المحادثات،
/// بديل عن حلقة تحميل عامة داخل الفقاعة. الحركة رأسية خفيفة مع تلاشٍ، بفارق
/// طور بين النقاط يولّد إحساس الموجة.
class TypingDots extends StatefulWidget {
  final Color color;
  final double dotSize;

  const TypingDots({super.key, this.color = RicoColors.primary, this.dotSize = 7});

  @override
  State<TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<TypingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++)
              Padding(
                padding: EdgeInsets.only(right: i == 2 ? 0 : 4),
                child: _dot(phase: i * 0.18),
              ),
          ],
        );
      },
    );
  }

  Widget _dot({required double phase}) {
    // موجة نصف جيبية على أول 60% من الدورة، وسكون بعدها.
    final t = (_controller.value + phase) % 1.0;
    final wave = t < 0.6 ? Curves.easeInOut.transform((0.5 - (t / 0.6 - 0.5).abs()) * 2) : 0.0;
    return Transform.translate(
      offset: Offset(0, -3 * wave),
      child: Container(
        width: widget.dotSize,
        height: widget.dotSize,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: widget.color.withValues(alpha: 0.35 + 0.65 * wave),
        ),
      ),
    );
  }
}
