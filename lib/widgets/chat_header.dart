import 'package:flutter/material.dart';
import '../services/auth_store.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';

/// شريط عنوان شاشة المحادثة — هوية ريكو (الشعار + الاسم + حالة الاتصال)
/// مع فاصل شعري يتحول إلى ظل خفيف عند تمرير المحادثة، فيبقى الشريط ملتصقاً
/// بصرياً بالمحتوى بدل أن يطفو فوقه بحدّ قاطع.
class ChatHeader extends StatelessWidget implements PreferredSizeWidget {
  /// هل مرّر المستخدم المحادثة لأسفل (فيظهر ظل الشريط)؟
  final bool elevated;
  final VoidCallback onOpenFavorites;

  /// يفتح ورقة الحساب للمسجّل أو ورقة الدخول للزائر — انظر ChatScreen.
  final VoidCallback onOpenAccount;

  const ChatHeader({
    super.key,
    required this.elevated,
    required this.onOpenFavorites,
    required this.onOpenAccount,
  });

  static const double _height = 66;

  @override
  Size get preferredSize => const Size.fromHeight(_height);

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top),
      decoration: BoxDecoration(
        color: RicoColors.canvas,
        border: const Border(bottom: BorderSide(color: RicoColors.hairline)),
        boxShadow: elevated ? RicoShadows.subtle : const [],
      ),
      child: SizedBox(
        height: _height,
        child: Padding(
          padding: const EdgeInsetsDirectional.only(start: 16, end: 8),
          child: Row(
            children: [
              const RicoAvatar(size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('ريكو', style: RicoText.title.copyWith(fontSize: 16.5)),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const _LiveDot(),
                        const SizedBox(width: 6),
                        Text('جاهز يخدمك', style: RicoText.caption.copyWith(color: RicoColors.success)),
                        Text('  ·  مساعدك الذكي', style: RicoText.caption.copyWith(color: RicoColors.inkFaint)),
                      ],
                    ),
                  ],
                ),
              ),
              _HeaderAction(
                icon: Icons.bookmark_border_rounded,
                tooltip: 'المفضّلة',
                onTap: onOpenFavorites,
              ),
              const SizedBox(width: 6),
              _AccountAction(onTap: onOpenAccount),
            ],
          ),
        ),
      ),
    );
  }
}

/// زر الحساب — حرف اسم المستخدم داخل دائرة بلون العلامة إذا كان مسجّلاً،
/// وأيقونة محايدة إذا كان زائراً. الحرف وحده يكفي كإشارة "أنت داخل" بلا
/// شريط حالة إضافي يزاحم ترويسة ضيقة أصلاً.
class _AccountAction extends StatelessWidget {
  final VoidCallback onTap;

  const _AccountAction({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AuthStore.instance,
      builder: (context, _) {
        final customer = AuthStore.instance.customer;
        final signedIn = customer != null;

        return Tooltip(
          message: signedIn ? customer.firstName : 'تسجيل الدخول',
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: signedIn ? null : RicoColors.surfaceSunken,
                gradient: signedIn
                    ? const LinearGradient(
                        begin: Alignment.topRight,
                        end: Alignment.bottomLeft,
                        colors: [RicoColors.primaryLift, RicoColors.primaryDeep],
                      )
                    : null,
                shape: BoxShape.circle,
              ),
              child: signedIn
                  ? Text(
                      customer.initial,
                      style: RicoText.labelStrong.copyWith(color: Colors.white, fontSize: 15),
                    )
                  : const Icon(Icons.person_outline_rounded, size: 20, color: RicoColors.inkBody),
            ),
          ),
        );
      },
    );
  }
}

class _HeaderAction extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _HeaderAction({required this.icon, required this.tooltip, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: RicoColors.surfaceSunken,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 20, color: RicoColors.inkBody),
        ),
      ),
    );
  }
}

/// نقطة حالة نابضة — هالة تتوسّع وتتلاشى حول نقطة ثابتة، إشارة "حيّ" هادئة
/// بلا وميض مزعج.
class _LiveDot extends StatefulWidget {
  const _LiveDot();

  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 14,
      height: 14,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final t = Curves.easeOut.transform(_controller.value);
          return Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 6 + 8 * t,
                height: 6 + 8 * t,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: RicoColors.success.withValues(alpha: 0.22 * (1 - t)),
                ),
              ),
              Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: RicoColors.success),
              ),
            ],
          );
        },
      ),
    );
  }
}
