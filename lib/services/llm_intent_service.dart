import 'dart:convert';
import 'package:http/http.dart' as http;
import '../brand.dart';
import '../models/customer_mood.dart';
import '../models/voice_signals.dart';
import 'intent_service.dart';

/// نية واحدة مفكوكة من رد المصنّف (LLM)، قد تمثّل بحثاً عن مكان أو طلب عروض.
/// رسالة واحدة قد تحتوي عدة نوايا (انظر [LlmClassification.intents]).
class ResolvedIntent {
  final String kind; // 'place' | 'deals' | 'professional' | 'order'
  final String? category;
  final String rank; // 'nearest' | 'cheapest' | 'open_now' | 'best_rated'
  final String? brandHint;
  final String? customTagKey;
  final String? customTagValue;
  final String? label;
  final int? referencedPosition;

  /// سلوق المهنة — لـkind == 'professional' فقط.
  final String? profession;

  /// اسم المحل والأصناف — لـkind == 'order' فقط.
  final String? placeName;
  final List<RequestedItem> orderItems;

  ResolvedIntent({
    required this.kind,
    this.category,
    this.rank = 'nearest',
    this.brandHint,
    this.customTagKey,
    this.customTagValue,
    this.label,
    this.referencedPosition,
    this.profession,
    this.placeName,
    this.orderItems = const [],
  });

  QueryIntent? toQueryIntent() {
    if (kind == 'deals') {
      return QueryIntent(kind: IntentKind.deals, label: label ?? 'العروض', referencedPosition: referencedPosition);
    }

    if (kind == 'order') {
      // قائمة أصناف فارغة مقبولة مع اسم محل: "بدي أطلب من مطعم الماهر"
      // طلبُ قائمةٍ يُفتح على التصفّح.
      final shop = placeName;
      if (shop != null && shop.isNotEmpty) {
        return QueryIntent(
          kind: IntentKind.order,
          label: shop,
          placeName: shop,
          orderItems: orderItems,
        );
      }

      // بلا اسم محل: الفئة + الأصناف تكفي، والخادم يختار المحل ("وصّلي من
      // مطعم وجبتين شاورما"). بلا أصناف ما فيه طلب أصلاً — هذا بحث عن مكان،
      // والخادم يسقطه قبل ما يوصلنا.
      final slug = category;
      if (slug == null || slug.isEmpty || orderItems.isEmpty) return null;
      final categoryIntent = IntentService.byCategorySlug(slug);
      return QueryIntent(
        kind: IntentKind.order,
        label: categoryIntent?.label ?? slug,
        slug: slug,
        orderItems: orderItems,
      );
    }

    if (kind == 'professional') {
      // بلا سلوق مهنة ما فيه شي نبحث عنه — الخادم يسقط هذي الحالة أصلاً
      // ([ClassifyService.validateIntent])، وهذا حارس ثانٍ لا أكثر.
      final slug = profession;
      if (slug == null || slug.isEmpty) return null;
      return IntentService.byProfessionSlug(slug, referencedPosition: referencedPosition);
    }

    final rankMode = _rankFromString(rank);

    if (category == 'other') {
      if (customTagKey == null || customTagValue == null || label == null) return null;
      return QueryIntent(
        label: label!,
        rank: rankMode,
        brandHint: brandHint,
        // نفس قيمة وسم OSM (مثل "hairdresser") تُستخدم كـcategorySlug عند
        // البحث في قاعدة ريكو أولاً — تماماً كما تفعل الفئات الثابتة
        // (restaurant/cafe/hotel...) — قبل السقوط لـOverpass إذا لم يوجد
        // نشاط مسجّل بهذه الفئة بعد.
        slug: customTagValue,
        referencedPosition: referencedPosition,
      );
    }
    if (category == null) return null;
    return IntentService.byCategorySlug(
      category!,
      rank: rankMode,
      brandHint: brandHint,
      referencedPosition: referencedPosition,
    );
  }

  static RankMode _rankFromString(String value) {
    switch (value) {
      case 'cheapest':
        return RankMode.cheapest;
      case 'open_now':
        return RankMode.openNow;
      case 'best_rated':
        return RankMode.bestRated;
      default:
        return RankMode.nearest;
    }
  }
}

/// نتيجة تصنيف الرسالة عبر الخادم الوسيط (Cloudflare Worker + Groq) — قد
/// تحتوي أكثر من نية واحدة إذا جمعت الرسالة أكثر من طلب مستقل.
class LlmClassification {
  final bool isOffTopic;
  final String? reply;
  final List<ResolvedIntent> intents;

  /// حالة العميل كما قرأها المصنّف — تغيّر شكل الرد لا محتوى البحث.
  /// انظر [CustomerMood].
  final CustomerMood mood;

  LlmClassification({
    required this.isOffTopic,
    this.reply,
    this.intents = const [],
    this.mood = CustomerMood.neutral,
  });

  List<QueryIntent> toQueryIntents() =>
      intents.map((i) => i.toQueryIntent()).whereType<QueryIntent>().toList();
}

/// يصنّف رسالة المستخدم عبر LLM (Groq) من خلال خادم وسيط يخفي مفتاح الـ API.
/// لا يُلقي أي استثناء أبداً؛ عند أي عطل (شبكة/مهلة/رد غير متوقع) يرجع null
/// ليستخدم المستدعي التصنيف المحلي القائم على الكلمات المفتاحية كخطة بديلة.
class LlmIntentService {
  // rico-backend (NestJS، يستبدل rico-intent-proxy القديم) يعرض هذا التصنيف
  // على المسار /classify (وليس الجذر كما كان الحال في الـ Worker القديم).
  // للتجربة المحلية بدّلها لـ http://localhost:3000/classify (iOS
  // Simulator/سطح المكتب) أو http://10.0.2.2:3000/classify (Android Emulator).
  static const String _proxyUrl = 'https://app.rico-go.com/classify';

  /// مهلتان: الأولى قصيرة للخادم الصاحي، والثانية طويلة لأن فشل الأولى غالباً
  /// معناه إن الخادم كان نايم (Render) وللتو بدأ يصحى — إيقاظه يحتاج ١٠-٢٠
  /// ثانية. بدون المحاولة الثانية كان أول سؤال بعد فترة خمول يسقط دائماً
  /// للمطابقة المحلية بالكلمات المفتاحية، فتُفهم "هلا" كطلب مطعم.
  /// [BackendWarmup] يقلل احتمال الوصول للمحاولة الثانية أصلاً.
  static const List<Duration> _attemptTimeouts = [Duration(seconds: 8), Duration(seconds: 25)];

  static Future<LlmClassification?> classify(
    String message, {
    List<Map<String, String>>? history,
    Map<String, dynamic>? lastResults,
    VoiceSignals? voice,
  }) async {
    final body = jsonEncode({
      'message': message,
      'brand': Brand.slug,
      if (history != null && history.isNotEmpty) 'history': history,
      if (lastResults != null) 'lastResults': lastResults,
      // تُبعث للرسائل الصوتية وحدها — رسالة مكتوبة ما لها نبرة نقيسها،
      // وبعث قياسات فاضية يخلّي المصنّف يتخيّل ما لم نعطه.
      if (voice != null) 'voice': voice.toJson(),
    });

    for (final timeout in _attemptTimeouts) {
      try {
        return _parse(await _post(body, timeout));
      } on _UpstreamFailure {
        // ردّ فعلي من الخادم بخطأ (مثل حد الاستخدام) — تكرار فوري ما يفيد.
        return null;
      } catch (_) {
        // مهلة أو فشل شبكة: يستحق محاولة ثانية بمهلة أطول.
        continue;
      }
    }
    return null;
  }

  static Future<http.Response> _post(String body, Duration timeout) => http
      .post(
        Uri.parse(_proxyUrl),
        headers: {'Content-Type': 'application/json'},
        body: body,
      )
      .timeout(timeout);

  /// يرمي [_UpstreamFailure] إذا ردّ الخادم بخطأ فعلي (فلا معنى لإعادة
  /// المحاولة فوراً)، ويرجع null إذا كان الرد سليماً لكن بلا نوايا صالحة.
  static LlmClassification? _parse(http.Response response) {
    if (response.statusCode != 200) throw const _UpstreamFailure();

    final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;

    final mood = CustomerMood.fromString(data['mood'] as String?);

    if (data['offTopic'] == true) {
      return LlmClassification(isOffTopic: true, reply: data['reply'] as String?, mood: mood);
    }

    final rawIntents = (data['intents'] as List?) ?? [];
    if (rawIntents.isEmpty) return null;

    final intents = rawIntents.map((raw) {
      final map = raw as Map<String, dynamic>;
      final customTag = map['customTag'] as Map<String, dynamic>?;
      return ResolvedIntent(
        kind: map['kind'] as String? ?? 'place',
        category: map['category'] as String?,
        rank: map['rank'] as String? ?? 'nearest',
        brandHint: map['brandHint'] as String?,
        customTagKey: customTag?['key'] as String?,
        customTagValue: customTag?['value'] as String?,
        label: map['label'] as String?,
        referencedPosition: map['referencedPosition'] as int?,
        profession: map['profession'] as String?,
        placeName: map['placeName'] as String?,
        orderItems: ((map['orderItems'] as List?) ?? [])
            .map((raw) {
              final item = raw as Map<String, dynamic>;
              return RequestedItem(
                name: (item['name'] as String?)?.trim() ?? '',
                quantity: (item['quantity'] as num?)?.toInt() ?? 1,
              );
            })
            .where((i) => i.name.isNotEmpty)
            .toList(),
      );
    }).toList();

    return LlmClassification(isOffTopic: false, intents: intents, mood: mood);
  }
}

/// ردّ خطأ من الخادم نفسه (حد استخدام، إعداد ناقص...) — يميّزه عن أخطاء
/// الشبكة/المهلة اللي تستاهل محاولة ثانية.
class _UpstreamFailure implements Exception {
  const _UpstreamFailure();
}
