import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// حبة رد سريع أسفل النتائج (مثل «أبغى أرخص») — بيضاء بحافة شعرية على
/// الأرضية العاجية، وتصير خضراء خفيفة عند التمييز ([emphasized]).
class ChatPillChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool emphasized;

  const ChatPillChip({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
    this.emphasized = false,
  });

  @override
  Widget build(BuildContext context) {
    final foreground = emphasized ? RicoColors.primaryDeep : RicoColors.inkBody;
    return Material(
      color: emphasized ? RicoColors.primaryTint : RicoColors.surface,
      borderRadius: RicoRadii.pillR,
      child: InkWell(
        onTap: onTap,
        borderRadius: RicoRadii.pillR,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: RicoRadii.pillR,
            border: Border.all(
              color: emphasized ? RicoColors.primaryTintStrong : RicoColors.hairlineStrong,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: emphasized ? RicoColors.primary : RicoColors.inkMuted),
                const SizedBox(width: 6),
              ],
              Text(label, style: RicoText.label.copyWith(color: foreground)),
            ],
          ),
        ),
      ),
    );
  }
}
