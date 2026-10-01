import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../models/place_result.dart';
import '../theme/app_theme.dart';
import 'category_visuals.dart';

/// صورة المكان أعلى بطاقة النتيجة.
///
/// ثلاث قرارات تستاهل الشرح:
///
/// ١. المساحة محجوزة بنسبة ثابتة قبل وصول الصورة، فما تتزحزح البطاقات تحتها
///    لما تنزل الصور. المحادثة تنزل تلقائياً لآخرها بعد كل رد، وأي قفزة
///    ارتفاع هنا تسحب الكلام من تحت عين القارئ.
///
/// ٢. رمز الفئة هو نفسه حالة التحميل وحالة "ما فيه صورة" وحالة الفشل — فما
///    يمرّ المستخدم أبداً على مربع رمادي فاضي، والمكان بلا صورة يبان مقصوداً
///    لا معطوباً.
///
/// ٣. الصورة تُطلب أول ما تُبنى البطاقة، وListView.builder ما يبني إلا
///    البطاقات القريبة من الشاشة — يعني نتائج ما وصلها المستخدم ما تُجلب
///    صورها أصلاً. هذا مقصود: كل صورة تُجلب فعلياً تكلّف (Place Photos).
class PlacePhoto extends StatelessWidget {
  final PlaceResult place;

  /// فئة المكان — منها يُشتق الرمز واللون البديلان عن الصورة.
  final String? categorySlug;

  /// نسبة العرض للارتفاع. الافتراضي 16:9 وهي نسبة الصور التي يرجعها Google
  /// غالباً، فتظهر بلا قص محسوس.
  final double aspectRatio;

  /// عناصر تطفو فوق الصورة (رقم الترتيب، زر الحفظ) — تُمرّر من البطاقة لا
  /// تُبنى هنا، فتبقى هذه الودجة مسؤولة عن الصورة وحدها.
  final List<Widget> overlays;

  const PlacePhoto({
    super.key,
    required this.place,
    this.categorySlug,
    this.aspectRatio = 16 / 9,
    this.overlays = const [],
  });

  /// عرض الصورة المطلوب من الخادم. أكبر من عرض البطاقة عمداً (تقريباً ضعفه)
  /// عشان تبقى حادة على الشاشات عالية الكثافة، وأصغر من الأصل عشان ما نحمّل
  /// المستخدم بيانات ما راح تبان على جواله.
  static const int _requestWidth = 800;

  @override
  Widget build(BuildContext context) {
    final url = place.photoUrl;

    return AspectRatio(
      aspectRatio: aspectRatio,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (url == null)
            _CategoryFallback(slug: categorySlug)
          else
            CachedNetworkImage(
              imageUrl: '$url?w=$_requestWidth',
              fit: BoxFit.cover,
              // تهيئة سريعة: الصورة تحلّ محل الرمز بنعومة بدل ما تقفز فجأة.
              fadeInDuration: const Duration(milliseconds: 220),
              // نفكّ الترميز بعرض العرض لا بعرض الأصل — ثماني صور بحجمها
              // الكامل في قائمة واحدة تأكل ذاكرة بلا فائدة بصرية.
              memCacheWidth: _requestWidth,
              placeholder: (_, __) => _CategoryFallback(slug: categorySlug),
              // ٤٠٤ من خادمنا معناها "ما فيه صورة لهذا المكان" وهي حالة
              // متوقعة لا عطل، وردّها نفس ردّ غياب الرابط أصلاً.
              errorWidget: (_, __, ___) => _CategoryFallback(slug: categorySlug),
              // نُسب الصورة لصاحبها داخل imageBuilder وحده: لو فشل التحميل
              // وظهر الرمز بدلها، ما يصح يبقى اسم مصوّر تحت رمز مرسوم.
              imageBuilder: (context, imageProvider) => Stack(
                fit: StackFit.expand,
                children: [
                  Image(image: imageProvider, fit: BoxFit.cover),
                  if (place.photoAttribution != null) _PhotoCredit(author: place.photoAttribution!),
                ],
              ),
            ),
          ...overlays,
        ],
      ),
    );
  }
}

/// البديل عن الصورة: رمز الفئة على لون هادئ من لوحة العلامة.
class _CategoryFallback extends StatelessWidget {
  final String? slug;

  const _CategoryFallback({required this.slug});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: CategoryVisuals.tintFor(slug),
      child: Center(
        child: Icon(
          CategoryVisuals.iconFor(slug),
          size: 34,
          // باهت عمداً: هو خلفية تملأ فراغاً، لا عنصر يزاحم اسم المكان.
          color: CategoryVisuals.inkFor(slug).withValues(alpha: 0.45),
        ),
      ),
    );
  }
}

/// نسبة الصورة لمصوّرها — شرط من شروط Google لعرض صور الأماكن.
///
/// تدرّج أسود خفيف تحتها لأن النص أبيض فوق صورة لا نعرف ألوانها: بدون
/// التدرّج قد يقع على سماء بيضاء فيختفي.
class _PhotoCredit extends StatelessWidget {
  final String author;

  const _PhotoCredit({required this.author});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 14, 10, 5),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.bottomCenter,
            end: Alignment.topCenter,
            colors: [Colors.black.withValues(alpha: 0.5), Colors.transparent],
          ),
        ),
        child: Text(
          'صورة: $author',
          style: RicoText.caption.copyWith(color: Colors.white.withValues(alpha: 0.85), fontSize: 10),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

/// حاوية دائرية شبه شفافة لأزرار تطفو فوق الصورة. الخلفية البيضاء الكثيفة
/// تضمن قراءة الأيقونة فوق أي صورة مهما كانت ألوانها — وهذا لازم هنا لأن
/// الصور من رفع المستخدمين ولا نتحكم فيها.
class PhotoOverlayButton extends StatelessWidget {
  final IconData icon;
  final Color tone;
  final String tooltip;
  final VoidCallback onTap;

  const PhotoOverlayButton({
    super.key,
    required this.icon,
    required this.tone,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white.withValues(alpha: 0.92),
        shape: const CircleBorder(),
        elevation: 1,
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(icon, size: 19, color: tone),
          ),
        ),
      ),
    );
  }
}
