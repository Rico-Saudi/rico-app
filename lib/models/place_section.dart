import '../services/intent_service.dart';
import 'place_result.dart';

/// مقطع نتائج واحد داخل فقاعة تجمع أكثر من طلب مكان من نفس الرسالة.
///
/// "أقرب مطعم وأرخص مطعم" رسالة وحدة، فيردّها رد واحد: مقطعان تحت بعض بدل
/// فقاعتين منفصلتين. الفئة وحدها ما تكفي لتمييز المقطعين — المعيار هو الفرق
/// بينهما — فلذلك يتصدّر [title].
class PlaceSection {
  final QueryIntent intent;
  final List<PlaceResult> places;

  /// نص يحل محل النتائج حين ما لقينا شيئاً لهذا المقطع تحديداً. الفقاعة
  /// المدموجة لازم تقول وش لقت ووش لا — إسقاط المقطع الفاشل بصمت يخلي
  /// المستخدم يظن إن طلبه الثاني ما وصل أصلاً.
  final String? emptyNote;

  const PlaceSection({
    required this.intent,
    this.places = const [],
    this.emptyNote,
  });

  bool get isEmpty => places.isEmpty;

  String get title => switch (intent.rank) {
        RankMode.cheapest => 'الأرخص · ${intent.label}',
        RankMode.openNow => 'المفتوح الحين · ${intent.label}',
        RankMode.bestRated => 'الأعلى تقييماً · ${intent.label}',
        RankMode.nearest => 'الأقرب · ${intent.label}',
      };
}
