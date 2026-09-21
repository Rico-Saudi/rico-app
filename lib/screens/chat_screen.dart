import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../models/business_catalog.dart';
import '../models/cart.dart';
import '../models/chat_message.dart';
import '../models/deal.dart';
import '../models/place_result.dart';
import '../models/place_section.dart';
import '../models/professional.dart';
import '../models/professional_flow.dart';
import '../models/weather_info.dart';
import '../models/request_flow.dart';
import '../services/auth_store.dart';
import '../services/backend_warmup.dart';
import '../services/catalog_service.dart';
import '../services/compose_service.dart';
import '../services/deals_service.dart';
import '../services/impression_service.dart';
import '../services/intent_service.dart';
import '../services/llm_intent_service.dart';
import '../services/location_service.dart';
import '../services/places_service.dart';
import '../services/professionals_service.dart';
import '../services/request_service.dart';
import '../services/search_gap_service.dart';
import '../services/session_memory_service.dart';
import '../services/transcribe_service.dart';
import '../services/voice_recording_service.dart';
import '../services/weather_service.dart';
import '../theme/app_theme.dart';
import '../widgets/auth/account_sheet.dart';
import '../widgets/auth/auth_sheet.dart';
import '../widgets/chat_composer.dart';
import '../widgets/chat_header.dart';
import '../widgets/message_bubble.dart';
import '../widgets/welcome_hero.dart';
import 'favorites_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final List<ChatMessage> _messages = [];
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  final LocationService _locationService = LocationService();
  final PlacesService _placesService = PlacesService();
  final SessionMemoryService _sessionMemory = SessionMemoryService();
  final DealsService _dealsService = DealsService();
  final ImpressionService _impressionService = ImpressionService();
  final SearchGapService _searchGapService = SearchGapService();
  final CatalogService _catalogService = CatalogService();
  final RequestService _requestService = RequestService();
  final TranscribeService _transcribeService = TranscribeService();
  final ProfessionalsService _professionalsService = ProfessionalsService();
  final WeatherService _weatherService = WeatherService();

  static final RegExp _homeMention = RegExp('بيتي|منزلي|البيت');

  Position? _cachedPosition;
  bool _sending = false;

  /// حالة الجو المعروضة في شاشة الترحيب، و null قبل وصولها أو إذا تعذّرت.
  WeatherInfo? _weather;

  /// متى جُلبت آخر قراءة — نعيد الجلب عند العودة للتطبيق فقط إذا قدمت.
  /// بلا هذا كان كل تنقّل بين التطبيقات يصرف نداءً على قراءة ما تغيّرت.
  DateTime? _weatherFetchedAt;

  /// الجو ما يتغيّر أسرع من هذا، ومصدره نفسه يحدّث كل ١٠ دقائق تقريباً —
  /// وأي تكرار أسرع يرجع نفس البايتات على حساب بطارية المستخدم وباقته.
  static const Duration _weatherStaleAfter = Duration(minutes: 20);

  /// جارٍ تحويل مقطع صوتي إلى نص — يُعطّل المؤلّف كما يفعل [_sending]، لكنه
  /// حالة مستقلة عنه لأنه يسبق الإرسال ولا يضيف فقاعة للمحادثة.
  bool _transcribing = false;

  /// هل نزل المستخدم عن أعلى المحادثة؟ يفعّل ظل الترويسة فقط عند الحاجة.
  bool _headerElevated = false;

  /// رسالة المستخدم الجاري تعديلها — نمسك الكائن نفسه لا موضعه، لأن الموضع
  /// يصير قديماً لو أُضيفت فقاعات وشريط التعديل مفتوح.
  ///
  /// التعديل لا يمسّ المحادثة إلا لحظة الإرسال: قبلها الرسالة القديمة وردها
  /// باقيان كما هما، فضغطة «تعديل» بالغلط ما تخسّر المستخدم شيئاً.
  ChatMessage? _editingMessage;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // نوقظ الخادم من أول لحظة (ومرة ثانية عند بدء الكتابة) عشان يكون صاحياً
    // وقت أول سؤال — وإلا تفشل مهلة التصنيف الذكي ويسقط الفهم للكلمات
    // المفتاحية. انظر [BackendWarmup].
    BackendWarmup.ping();
    _controller.addListener(BackendWarmup.ping);
    WidgetsBinding.instance.addObserver(this);
    _restoreConversation();
    _refreshWeather();
  }

  /// يُعاد الجلب عند العودة من الخلفية لا بمؤقّت: المستخدم اللي يفتح ريكو بعد
  /// ساعات يستاهل قراءة جديدة، واللي تاركه مفتوح ما يستفيد من واحدة كل دقيقة.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshWeather();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scrollController.removeListener(_onScroll);
    _controller.removeListener(BackendWarmup.ping);
    _scrollController.dispose();
    _controller.dispose();
    super.dispose();
  }

  void _onScroll() {
    final elevated = _scrollController.hasClients && _scrollController.offset > 4;
    if (elevated != _headerElevated) setState(() => _headerElevated = elevated);
  }

  /// يستعيد آخر محادثة محفوظة محلياً (إن وُجدت ولم تنقض صلاحيتها) بدل بدء
  /// محادثة جديدة كل مرة. عند عدم وجود محادثة تبقى القائمة فارغة فتظهر شاشة
  /// الترحيب [WelcomeHero] بدل فقاعة ترحيب نصية طويلة.
  Future<void> _restoreConversation() async {
    final restored = await _sessionMemory.loadTranscript();
    if (!mounted || restored.isEmpty) return;
    setState(() => _messages.addAll(restored));
    _scrollToBottom();
  }

  /// يجلب حالة الجو لموقع المستخدم بهدوء تام: بلا مؤشر تحميل وبلا رسالة خطأ،
  /// وبلا طلب إذن موقع من أجله وحده — إذا ما كان الموقع متاحاً أصلاً نتخطاه،
  /// لأن نافذة إذن تظهر بسبب اقتراح جو تُقرأ كتطفّل لا كخدمة.
  Future<void> _refreshWeather() async {
    final fetchedAt = _weatherFetchedAt;
    if (fetchedAt != null && DateTime.now().difference(fetchedAt) < _weatherStaleAfter) return;

    final position = _cachedPosition;
    if (position == null && !await _locationService.hasPermission()) return;

    try {
      final origin = position ?? await _getPosition();
      final weather = await _weatherService.fetch(lat: origin.latitude, lng: origin.longitude);
      if (!mounted || weather == null) return;
      setState(() {
        _weather = weather;
        _weatherFetchedAt = DateTime.now();
      });
    } catch (_) {
      // الموقع غير متاح أو فشل الجلب — الشاشة تظهر بلا بطاقة جو، وهذا كل شي.
    }
  }

  Future<Position> _getPosition() async {
    if (_cachedPosition != null) return _cachedPosition!;
    final pos = await _locationService.getCurrentLocation();
    _cachedPosition = pos;
    return pos;
  }

  /// يحدد نقطة انطلاق البحث: يستخدم موقع "بيتي" المحفوظ إذا ذكره المستخدم
  /// وكان محفوظاً، وإلا يستخدم GPS الحالي (ويعرض حفظه كـ"بيتي" لاحقاً إذا
  /// كانت هذه أول مرة يذكر فيها بيته ولا يوجد موقع محفوظ).
  Future<({double lat, double lng, bool offerSaveHome})> _resolveOrigin(String text) async {
    if (_homeMention.hasMatch(text)) {
      final home = await _sessionMemory.getHome();
      if (home != null) {
        return (lat: home.lat, lng: home.lng, offerSaveHome: false);
      }
      final position = await _getPosition();
      return (lat: position.latitude, lng: position.longitude, offerSaveHome: true);
    }
    final position = await _getPosition();
    return (lat: position.latitude, lng: position.longitude, offerSaveHome: false);
  }

  /// الرسائل القابلة للحفظ/الإرسال كسياق: نصية فقط، غير قيد التحميل، وبلا
  /// تدفّق طلب مرتبط (لا معنى لاستعادة أزرار/حالات تفاعلية من محادثة سابقة).
  List<ChatMessage> get _persistableMessages => _messages
      .where((m) => !m.isLoading && m.text.isNotEmpty && m.requestFlow == null && m.professionalFlow == null)
      .toList();

  /// يبني آخر رسائل المحادثة كسياق للتصنيف عبر LLM، لدعم الاستكمالات مثل
  /// "بس أبعد شوي" بدل معاملة كل رسالة بمعزل عمّا سبقها.
  List<Map<String, String>> _buildHistory() {
    final relevant = _persistableMessages;
    final recent = relevant.length > 10 ? relevant.sublist(relevant.length - 10) : relevant;
    return recent
        .map((m) => {
              'role': m.sender == MessageSender.user ? 'user' : 'assistant',
              'content': m.text,
            })
        .toList();
  }

  /// يبحث عن آخر رسالة عرضت نتائج فعلية (أماكن أو عروض) بترتيبها المعروض
  /// للمستخدم، لدعم إشارات مثل "الثاني" أو "مثله بس أرخص". يُحسب من ترتيب
  /// [_messages] نفسه (ثابت وقت إنشاء الفقاعات) لا من ترتيب اكتمال الجلب
  /// الشبكي (متزامن وغير محدّد الترتيب عند تعدد النوايا في رسالة واحدة).
  ({String label, List<PlaceResult>? places, List<Deal>? deals})? _findLastShown() {
    for (var i = _messages.length - 1; i >= 0; i--) {
      final m = _messages[i];
      if (m.places != null && m.places!.isNotEmpty) {
        return (label: m.understandingIntent?.label ?? '', places: m.places, deals: null);
      }
      if (m.deals != null && m.deals!.isNotEmpty) {
        return (label: 'العروض', places: null, deals: m.deals);
      }
    }
    return null;
  }

  /// يبني نسخة مختصرة (رقم + اسم فقط) من آخر نتائج معروضة لإرسالها مع طلب
  /// التصنيف عبر LLM — يكفي المصنّف لحل إشارات ترتيبية دون كشف بيانات كاملة.
  Map<String, dynamic>? _buildLastResultsPayload() {
    final last = _findLastShown();
    if (last == null) return null;
    final items = last.places != null
        ? [
            for (var j = 0; j < last.places!.length; j++) {'position': j + 1, 'name': last.places![j].name}
          ]
        : [
            for (var j = 0; j < last.deals!.length; j++) {'position': j + 1, 'name': last.deals![j].placeName}
          ];
    return {'label': last.label, 'items': items};
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  /// يحل إشارة لعنصر محدد من آخر نتائج معروضة (مثل "الثاني") من الذاكرة
  /// المحلية مباشرة — بدون بحث شبكي جديد، فيحافظ على بيانات النتيجة الأصلية
  /// (السعر/التقييم/المصدر) كما هي بدل المجازفة بإعادة بحث بالاسم قد يُرجع
  /// نسخة مختلفة (مصدرها OSM لا ريكو) لنفس المكان. يرجع null إذا لم يعد
  /// الترتيب المطلوب موجوداً (تغيّرت القائمة)، فيعامل الطلب كبحث عادي.
  Future<ChatMessage?> _resolveReferencedMessage(
    String text,
    QueryIntent intent,
    int position,
    ({double lat, double lng, bool offerSaveHome}) origin,
  ) async {
    final last = _findLastShown();
    final lastPlaces = last?.places;
    final lastDeals = last?.deals;
    final place = (lastPlaces != null && position <= lastPlaces.length) ? lastPlaces[position - 1] : null;
    final deal = (lastDeals != null && position <= lastDeals.length) ? lastDeals[position - 1] : null;
    if (place == null && deal == null) return null;

    final composedReply = await ComposeService.composeReply(
      message: text,
      intentKind: place != null ? 'place' : 'deals',
      intentLabel: intent.label,
      rank: 'nearest',
      items: place != null
          ? [
              {
                'name': place.name,
                if (place.distanceMeters != null) 'distanceMeters': place.distanceMeters,
                if (place.priceLevel != null) 'priceLevel': place.priceLevel,
                if (place.rating != null) 'rating': place.rating,
                if (place.ratingCount != null) 'ratingCount': place.ratingCount,
                if (place.isOpenNow != null) 'openNow': place.isOpenNow,
              }
            ]
          : [
              {
                'name': deal!.placeName,
                'dealLabel': deal.typeLabel,
                if (deal.distanceMeters != null) 'distanceMeters': deal.distanceMeters,
              }
            ],
      truncated: false,
      history: _buildHistory(),
      lat: origin.lat,
      lng: origin.lng,
    );

    return ChatMessage(
      text: composedReply ?? 'هاد تفاصيل ${intent.label} رقم $position:',
      sender: MessageSender.bot,
      places: place != null ? [place] : null,
      deals: deal != null ? [deal] : null,
      understandingIntent: intent,
      onOrder: place != null ? _openCatalog : null,
      onQuickReply: _sendQuickReply,
    );
  }

  /// يحل نية واحدة (مكان أو عروض أو صاحب مهنة) إلى رسالة رد جاهزة، مع عزل
  /// الأخطاء داخل النية نفسها (فشل نية واحدة من عدة نوايا في نفس الرسالة لا
  /// يوقف البقية).
  ///
  /// [index] هو موضع فقاعة التحميل التي ستُستبدل بهذي الرسالة — تحتاجه نتائج
  /// أصحاب المهن وحدها، لأن أزرارها تعدّل حالة نفس الرسالة لاحقاً (اختيار ثم
  /// تأكيد)، فلازم تعرف موضعها. لا يصح استنتاجه من [_messages.length] وقت
  /// الحل: الفقاعة موجودة أصلاً في القائمة، وقد تكون معها فقاعات نوايا أخرى
  /// من نفس الرسالة تُحل بالتوازي.
  /// نية واحدة → رسالتها، مع مسار "الإشارة لنتيجة سابقة" قبل البحث الشبكي.
  ///
  /// إشارة لعنصر محدد من آخر نتائج (مثل "الثاني") تُحل من الذاكرة المحلية
  /// أولاً بدون بحث شبكي جديد؛ إن لم تعد قابلة للحل (تغيّرت القائمة) نسقط
  /// تلقائياً لمسار البحث العادي.
  Future<ChatMessage> _resolveOne(
    String text,
    QueryIntent intent,
    ({double lat, double lng, bool offerSaveHome}) origin,
    bool usedFallback,
    int index,
  ) async {
    final referencedPosition = intent.referencedPosition;
    if (referencedPosition != null) {
      final message = await _resolveReferencedMessage(text, intent, referencedPosition, origin);
      if (message != null) return message;
    }
    return _resolveIntentMessage(text, intent, origin, usedFallback, index);
  }

  /// يسقط النوايا المكررة حرفياً من رسالة واحدة.
  ///
  /// المصنّف أحياناً يرجّع نفس الطلب مرتين لما يتكرر بالجملة ("أبي مطعم
  /// وأبي مطعم") — تنفيذها مرتين بحثان مدفوعان لنفس الجواب بالضبط. أما
  /// اختلاف المعيار (أقرب/أرخص) فليس تكراراً: هو طلبان فعلاً، ولكل واحد
  /// جوابه.
  static List<QueryIntent> _dedupeIntents(List<QueryIntent> intents) {
    final seen = <String>{};
    return [
      for (final i in intents)
        if (seen.add([
          i.kind.name,
          i.slug ?? '',
          i.label,
          i.rank.name,
          i.brandHint ?? '',
          i.profession ?? '',
          i.placeName ?? '',
          i.referencedPosition?.toString() ?? '',
        ].join('|')))
          i,
    ];
  }

  /// يدمج ردود عدة نوايا أماكن بفقاعة واحدة ذات مقاطع مسمّاة.
  ///
  /// كل نية تبقى ببحثها الخاص عمداً: الخادم يرجّع **صفوفاً مختلفة** لا
  /// ترتيباً مختلفاً — "الأقرب" استعلام ‎$near بحد ٨، و"الأرخص" استعلام
  /// ‎$geoWithin على النطاق كله ثم فرز بالسعر — فإعادة فرز نتيجة "الأقرب"
  /// محلياً تعطي "أرخص الثمانية الأقرب"، وهذا جواب ثانٍ غير اللي انطلب.
  ChatMessage _mergePlaceMessages(List<QueryIntent> intents, List<ChatMessage> messages) {
    final sections = <PlaceSection>[];
    for (var i = 0; i < intents.length; i++) {
      final places = messages[i].places ?? const <PlaceResult>[];
      sections.add(PlaceSection(
        intent: intents[i],
        places: places,
        emptyNote: places.isEmpty ? messages[i].text : null,
      ));
    }

    // القائمة المسطّحة بلا تكرار: عليها تعتمد الإشارة لنتيجة سابقة
    // ("الثاني")، ونفس المحل قد يطلع بمقطعين (الأقرب والأرخص معاً).
    final flat = <PlaceResult>[];
    final seen = <String>{};
    for (final section in sections) {
      for (final place in section.places) {
        if (seen.add(place.osmId)) flat.add(place);
      }
    }

    final withResults = sections.where((s) => !s.isEmpty).length;
    final lead = withResults == 0
        ? 'ما لقيت لك ولا وحدة منها قريبة الحين 😕'
        : withResults == sections.length
            ? 'لقيت لك اللي طلبته 👌'
            : 'لقيت لك جزء من طلبك 👌';

    final withOrder = messages.firstWhere((m) => m.onOrder != null, orElse: () => messages.first);
    final withQuickReply = messages.firstWhere((m) => m.onQuickReply != null, orElse: () => messages.first);

    return ChatMessage(
      text: lead,
      sender: MessageSender.bot,
      places: flat.isEmpty ? null : flat,
      placeSections: sections,
      understandingIntent: intents.first,
      onOrder: withOrder.onOrder,
      onQuickReply: withQuickReply.onQuickReply,
    );
  }

  Future<ChatMessage> _resolveIntentMessage(
    String text,
    QueryIntent intent,
    ({double lat, double lng, bool offerSaveHome}) origin,
    bool usedFallback,
    int index,
  ) async {
    if (intent.kind == IntentKind.professional) {
      return _resolveProfessionalMessage(text, intent, origin, index);
    }

    if (intent.kind == IntentKind.order) {
      return _resolveOrderMessage(intent, index);
    }

    if (intent.kind == IntentKind.deals) {
      try {
        final deals = await _dealsService.fetchNearby(lat: origin.lat, lng: origin.lng);
        if (deals.isEmpty) {
          return ChatMessage(text: 'ما لقيت عروض قريبة منك الحين 😕', sender: MessageSender.bot);
        }
        unawaited(_impressionService.trackItems(
          deals.map((d) => ImpressionItem(businessId: d.placeId, dealId: d.id)).toList(),
        ));
        final composedReply = await ComposeService.composeReply(
          message: text,
          intentKind: 'deals',
          intentLabel: intent.label,
          rank: 'nearest',
          items: deals
              .map((d) => {
                    'name': d.placeName,
                    'dealLabel': d.typeLabel,
                    if (d.distanceMeters != null) 'distanceMeters': d.distanceMeters,
                  })
              .toList(),
          truncated: false,
          history: _buildHistory(),
          lat: origin.lat,
          lng: origin.lng,
        );
        return ChatMessage(
          text: composedReply ?? 'هذي أقرب العروض المتوفرة لك:',
          sender: MessageSender.bot,
          deals: deals,
        );
      } on DealsException catch (e) {
        return ChatMessage(text: e.message, sender: MessageSender.bot);
      } catch (_) {
        return ChatMessage(text: 'ما قدرت أجيب العروض الحين 😕', sender: MessageSender.bot);
      }
    }

    try {
      final places = await _placesService.search(
        userLat: origin.lat,
        userLng: origin.lng,
        cheapest: intent.wantsCheapest,
        openNow: intent.wantsOpenNow,
        bestRated: intent.rank == RankMode.bestRated,
        brandHint: intent.brandHint,
        categorySlug: intent.slug,
        // للفئات الحرة ("other") ما فيه slug ثابت — الاسم العربي هو نص البحث
        // الوحيد المتاح، والخادم يمرره لـGoogle Text Search.
        label: intent.slug == null ? intent.label : null,
      );

      if (places.isEmpty) {
        // إشارة استقطاب: لا يوجد نشاط تجاري من هذه الفئة في قاعدتنا بهذه
        // المنطقة. فقط للفئات الثابتة (categorySlug) — لا معنى لتتبّع نص حر.
        if (intent.slug != null) {
          unawaited(_searchGapService.track(categorySlug: intent.slug!, lat: origin.lat, lng: origin.lng));
        }
        return ChatMessage(
          text: 'ما لقيت ${intent.label} قريب منك الحين 😕 جرّب توسّع نطاق البحث أو نوع ثاني.',
          sender: MessageSender.bot,
        );
      }

      // نتتبّع الظهور فقط للأماكن التي وصلت من rico-backend (osmId عندها
      // معرّف Business حقيقي) — نتائج Overpass الاحتياطية لا يقابلها سجل
      // نشاط تجاري فعلي في قاعدتنا فلا معنى لتتبّعها.
      final ricoPlaceIds = places.where((p) => p.source == 'rico').map((p) => p.osmId).toList();
      if (ricoPlaceIds.isNotEmpty) {
        unawaited(_impressionService.track(ricoPlaceIds));
      }

      final rankStr = switch (intent.rank) {
        RankMode.cheapest => 'cheapest',
        RankMode.openNow => 'open_now',
        RankMode.bestRated => 'best_rated',
        RankMode.nearest => 'nearest',
      };

      final composedReply = await ComposeService.composeReply(
        message: text,
        intentKind: 'place',
        intentLabel: intent.label,
        rank: rankStr,
        items: places
            .take(5)
            .map((p) => {
                  'name': p.name,
                  if (p.distanceMeters != null) 'distanceMeters': p.distanceMeters,
                  if (p.priceLevel != null) 'priceLevel': p.priceLevel,
                  if (p.rating != null) 'rating': p.rating,
                  if (p.ratingCount != null) 'ratingCount': p.ratingCount,
                  if (p.isOpenNow != null) 'openNow': p.isOpenNow,
                })
            .toList(),
        truncated: places.length > 5,
        history: _buildHistory(),
        lat: origin.lat,
        lng: origin.lng,
      );

      // نميّز بين ترتيب حقيقي فعلاً (وصل من rico-api ومعه بيانات سعر/تقييم)
      // وبين رجوع Overpass الاحتياطي (بلا هذه البيانات) — حتى لا نوهم
      // المستخدم بترتيب حقيقي غير موجود فعلياً.
      var introText = composedReply;

      if (introText == null) {
        introText = 'هذي أقرب ${intent.label} لموقعك:';

        if (intent.wantsCheapest) {
          introText = places.first.priceLevel != null
              ? 'رتّبت لك ${intent.label} من الأرخص للأغلى حسب الأسعار الفعلية:'
              : 'رتّبت لك أقرب ${intent.label} (الأقرب غالباً أوفر لأنك توفّر وقت ومشوار):';
        } else if (intent.rank == RankMode.bestRated) {
          introText = places.first.rating != null
              ? 'رتّبت لك ${intent.label} من الأعلى تقييماً:'
              : 'هذي أقرب ${intent.label} لموقعك (ما فيه بيانات تقييم كافية للحين):';
        }

        if (intent.wantsOpenNow) {
          // ما ندّعي إنها كلها مفتوحة إلا إذا كل نتيجة فعلاً مؤكدة مفتوحة —
          // النتائج اللي ما عندنا عنها بيانات دوام تبقى "ما قدرت أتأكد".
          final allConfirmedOpen = places.every((p) => p.isOpenNow == true);
          final someConfirmedOpen = places.any((p) => p.isOpenNow == true);
          introText = allConfirmedOpen
              ? 'هذي أقرب ${intent.label} المفتوحة الحين:'
              : someConfirmedOpen
                  ? 'هذي أقرب ${intent.label}، والمفتوح منها مؤشر عليه:'
                  : 'ما قدرت أتأكد من مواعيد الدوام بالضبط، بس هذي أقرب ${intent.label}:';
        }
      }

      if (usedFallback) {
        introText += '\n(ما قدرت أتأكد من نوع طلبك بالضبط، صحّح لي إذا ما كان هذا قصدك 🙂)';
      }

      return ChatMessage(
        text: introText,
        sender: MessageSender.bot,
        places: places,
        understandingIntent: intent,
        onOrder: _openCatalog,
        onQuickReply: _sendQuickReply,
      );
    } on PlacesException catch (e) {
      return ChatMessage(text: e.message, sender: MessageSender.bot);
    } catch (_) {
      return ChatMessage(text: 'صار خطأ غير متوقع، حاول مرة ثانية 😕', sender: MessageSender.bot);
    }
  }

  /// يحل نية "أقرب صاحب مهنة" إلى رسالة فيها قائمة أشخاص قابلة للاختيار.
  ///
  /// لا مسار احتياطي خارجي هنا بعكس الأماكن: أصحاب المهن كلهم مسجّلون عندنا
  /// بأنفسهم، فما فيه Google ولا OSM يكمّل النقص — قائمة فارغة معناها فعلاً
  /// ما فيه أحد سجّل هالمهنة بالمنطقة بعد، وهذي حالة متوقعة نقولها صراحة
  /// بدل ما نعرض بديلاً غير مطلوب.
  Future<ChatMessage> _resolveProfessionalMessage(
    String text,
    QueryIntent intent,
    ({double lat, double lng, bool offerSaveHome}) origin,
    int index,
  ) async {
    final profession = intent.profession;
    if (profession == null) {
      return ChatMessage(text: 'ما فهمت أي مهنة تقصد بالضبط 🤔 قل لي المهنة مثل «دهان» أو «كهربائي».', sender: MessageSender.bot);
    }

    try {
      final professionals = await _professionalsService.search(
        lat: origin.lat,
        lng: origin.lng,
        profession: profession,
      );

      if (professionals.isEmpty) {
        return ChatMessage(
          text: 'ما لقيت ${intent.label} مسجّل قريب منك الحين 😕 إذا تعرف واحد، قل له يضيف مهنته من حسابه بالتطبيق.',
          sender: MessageSender.bot,
        );
      }

      final composedReply = await ComposeService.composeReply(
        message: text,
        intentKind: 'professional',
        intentLabel: intent.label,
        rank: 'nearest',
        items: professionals
            .take(5)
            .map((p) => {
                  'name': p.name,
                  'professionLabel': p.professionLabel,
                  'distanceMeters': p.distanceMeters,
                })
            .toList(),
        truncated: professionals.length > 5,
        history: _buildHistory(),
        lat: origin.lat,
        lng: origin.lng,
      );

      return ChatMessage(
        text: composedReply ?? 'هذي أقرب ${intent.label} لك:',
        sender: MessageSender.bot,
        understandingIntent: intent,
        professionalFlow: ProfessionalFlow(professionals: professionals),
        onSelectProfessional: (professional) => _selectProfessional(index, professional),
        onConfirmProfessionalRequest: (note) => _confirmProfessionalRequest(index, note, origin),
        onProfessionalRequestLogin: () => _signInThenSendProfessionalRequest(index, origin),
        onCancelProfessionalSelection: () => _cancelProfessionalSelection(index),
        onQuickReply: _sendQuickReply,
      );
    } on ProfessionalsException catch (e) {
      return ChatMessage(text: e.message, sender: MessageSender.bot);
    } catch (_) {
      return ChatMessage(text: 'ما قدرت أدوّر على ${intent.label} الحين 😕', sender: MessageSender.bot);
    }
  }

  void _selectProfessional(int index, Professional professional) {
    final flow = _professionalFlowAt(index);
    if (flow == null) return;
    setState(() {
      _messages[index] = _messages[index].copyWith(
        professionalFlow: flow.copyWith(
          stage: ProfessionalFlowStage.confirming,
          selected: professional,
          clearError: true,
        ),
      );
    });
    _scrollToBottom();
  }

  void _cancelProfessionalSelection(int index) {
    final flow = _professionalFlowAt(index);
    if (flow == null) return;
    setState(() {
      _messages[index] = _messages[index].copyWith(
        professionalFlow: flow.copyWith(
          stage: ProfessionalFlowStage.browsing,
          clearSelection: true,
          clearError: true,
        ),
      );
    });
  }

  /// يفتح ورقة الدخول من داخل بطاقة الطلب ويكمل الإرسال تلقائياً — نفس منطق
  /// [_signInThenConfirm] لطلبات الأنشطة التجارية.
  Future<void> _signInThenSendProfessionalRequest(
    int index,
    ({double lat, double lng, bool offerSaveHome}) origin,
  ) async {
    final signedIn = await showAuthSheet(
      context,
      reason: 'سجّل دخولك عشان يوصله اسمك ورقمك ويقدر يتصل فيك.',
    );
    if (!mounted || !signedIn) return;
    await _confirmProfessionalRequest(index, null, origin);
  }

  Future<void> _confirmProfessionalRequest(
    int index,
    String? note,
    ({double lat, double lng, bool offerSaveHome}) origin,
  ) async {
    final flow = _professionalFlowAt(index);
    final selected = flow?.selected;
    if (flow == null || selected == null) return;

    // حارس أخير: البطاقة تعرض زر الدخول للزائر أصلاً، لكن الجلسة قد تنتهي
    // بين فتح البطاقة والضغط على "أكّد".
    final token = AuthStore.instance.token;
    if (token == null) {
      await _signInThenSendProfessionalRequest(index, origin);
      return;
    }

    setState(() {
      _messages[index] = _messages[index].copyWith(
        professionalFlow: flow.copyWith(
          stage: ProfessionalFlowStage.submitting,
          note: note,
          clearError: true,
        ),
      );
    });

    try {
      await _professionalsService.submitRequest(
        professionalId: selected.id,
        token: token,
        note: note,
        lat: origin.lat,
        lng: origin.lng,
      );
      if (!mounted) return;
      _updateProfessionalFlow(index, (f) => f.copyWith(stage: ProfessionalFlowStage.submitted));
    } on ProfessionalsException catch (e) {
      if (!mounted) return;
      _updateProfessionalFlow(
        index,
        (f) => f.copyWith(stage: ProfessionalFlowStage.confirming, errorMessage: e.message),
      );
    } catch (_) {
      if (!mounted) return;
      _updateProfessionalFlow(
        index,
        (f) => f.copyWith(
          stage: ProfessionalFlowStage.confirming,
          errorMessage: 'ما قدرت أرسل طلبك الحين، حاول مرة ثانية.',
        ),
      );
    } finally {
      _scrollToBottom();
    }
  }

  /// التدفّق يُقرأ من [_messages] عند كل استخدام لا يُحتفظ به: الرسالة تُستبدل
  /// بنسخة جديدة مع كل تغيّر حالة، فنسخة قديمة محفوظة تكتب فوق ما بعدها.
  ProfessionalFlow? _professionalFlowAt(int index) {
    if (index >= _messages.length) return null;
    return _messages[index].professionalFlow;
  }

  void _updateProfessionalFlow(int index, ProfessionalFlow Function(ProfessionalFlow) update) {
    final flow = _professionalFlowAt(index);
    if (flow == null) return;
    setState(() => _messages[index] = _messages[index].copyWith(professionalFlow: update(flow)));
  }

  /// يفتح تعديل رسالة مستخدم سابقة: نصها ينزل في حقل الكتابة ويظهر شريط
  /// «تعديل رسالتك» فوقه. الحذف الفعلي مؤجّل للإرسال (انظر [_handleSend]).
  void _beginEditMessage(ChatMessage message) {
    if (_sending || _transcribing) return;
    setState(() => _editingMessage = message);
    _controller.text = message.text;
    _controller.selection = TextSelection.collapsed(offset: message.text.length);
  }

  /// يتراجع عن التعديل ويرجّع الحقل فاضياً — المحادثة أصلاً ما تغيّرت.
  void _cancelEditMessage() {
    if (_editingMessage == null) return;
    setState(() => _editingMessage = null);
    _controller.clear();
  }

  Future<void> _handleSend() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    // تعديل رسالة سابقة: نرمي الرسالة القديمة وكل ما تفرّع عنها، ثم نكمل
    // بالمسار الطبيعي — فالنص المعدّل يمر بنفس التصنيف والبحث ويدخل نفس
    // سياق [_buildHistory]، بدل ترقيع الرد القديم مكانه. الرد الملغى هو
    // جواب سؤال ما عاد موجوداً، وتركه يخلّي ريكو يناقض نفسه بنفس الشاشة.
    final editing = _editingMessage;
    if (editing != null) {
      final index = _messages.indexOf(editing);
      setState(() {
        _editingMessage = null;
        if (index != -1) _messages.removeRange(index, _messages.length);
      });
    }

    // سؤال عن الجو يُجاب من القراءة المحفوظة مباشرة: بلا تصنيف ولا بحث ولا
    // انتظار خادم. كان ريكو يرد عليه بـ«ما أقدر أساعدك في هذي» وهو يعرف
    // الجواب فعلاً — [IntentService.isWeatherQuestion] يتكفّل بألا تُلتقط
    // رسالة فيها طلب مكان (مثل «الجو حار أبغى كافيه») على أنها سؤال جو.
    if (IntentService.isWeatherQuestion(text)) {
      await _answerWeatherQuestion(text);
      return;
    }

    setState(() {
      _messages.add(ChatMessage(text: text, sender: MessageSender.user));
      _messages.add(ChatMessage(text: 'ريكو يدوّر لك الحين…', sender: MessageSender.bot, isLoading: true));
      _sending = true;
    });
    _controller.clear();
    _scrollToBottom();

    try {
      final classification = await LlmIntentService.classify(
        text,
        history: _buildHistory(),
        lastResults: _buildLastResultsPayload(),
      );

      if (classification != null && classification.isOffTopic) {
        setState(() {
          _messages.removeLast(); // إزالة رسالة "يبحث..."
          _messages.add(ChatMessage(
            text: classification.reply ??
                'أنا ريكو، أساعدك تلقى أقرب مطعم أو كافيه أو صيدلية وغيرها 😊 جرّب تسألني مثل «أقرب مطعم».',
            sender: MessageSender.bot,
          ));
        });
        return;
      }

      final lastCategorySlug = await _sessionMemory.getLastCategorySlug();
      var intents = classification?.toQueryIntents() ?? const <QueryIntent>[];
      final usedFallback = classification == null || intents.isEmpty;
      if (intents.isEmpty) {
        // مصنّف الـLLM فشل أو ما رجّع أي نية (غالباً بسبب Cold start/شبكة
        // بطيئة) — قبل التخمين المحلي بفئة، افحص إذا كانت الرسالة أصلاً
        // تحية/شكر/دردشة عامة بلا أي إشارة لمكان أو عروض. بدون هالفحص كانت
        // رسالة متل "هلا" ترجع بحث "مطعم" افتراضياً بدل رد بتحية طبيعية.
        if (!IntentService.hasSearchSignal(text, lastCategorySlug: lastCategorySlug)) {
          final offTopicReply = IntentService.detectOffTopicReply(text);
          if (offTopicReply != null) {
            setState(() {
              _messages.removeLast(); // إزالة رسالة "ريكو يدوّر لك الحين…"
              _messages.add(ChatMessage(text: offTopicReply, sender: MessageSender.bot));
            });
            return;
          }
        }
        intents = IntentService.parseMulti(text, lastCategorySlug: lastCategorySlug);
      }

      // لا مصنّف LLM ولا مطابقة محلية ولا نمط دردشة معروف: ما فهمنا الرسالة.
      // كان [IntentService.parse] يرجع "مطعم" كافتراضي صامت بهذي الحالة، فأي
      // سؤال غير مفهوم يُجاب ببحث عن مطاعم قريبة. طلب التوضيح أصدق.
      if (intents.isEmpty) {
        setState(() {
          _messages.removeLast(); // إزالة رسالة "ريكو يدوّر لك الحين…"
          _messages.add(ChatMessage(text: IntentService.clarifyReply(text), sender: MessageSender.bot));
        });
        return;
      }

      final origin = await _resolveOrigin(text);

      intents = _dedupeIntents(intents);

      // خانات العرض: كل خانة = فقاعة واحدة.
      //
      // نوايا الأماكن كلها تجتمع بخانة وحدة: المستخدم كتبها برسالة وحدة
      // ("أقرب مطعم وأرخص مطعم") فيردّها رد واحد بمقاطع مسمّاة، بدل فقاعتين
      // متطابقتي الشكل يصعب ربط كل وحدة بطلبها. وما عداها — العروض وأصحاب
      // المهن والطلبات — يبقى كل واحد بفقاعته، لأن كل واحد منها تدفّق
      // تفاعلي قائم بذاته (سلّة، اختيار صاحب مهنة) ما ينضم لغيره.
      final slots = <List<QueryIntent>>[];
      List<QueryIntent>? placeSlot;
      for (final intent in intents) {
        if (intent.kind == IntentKind.place) {
          if (placeSlot == null) {
            placeSlot = [intent];
            slots.add(placeSlot);
          } else {
            placeSlot.add(intent);
          }
        } else {
          slots.add([intent]);
        }
      }

      // نستبدل رسالة "يبحث..." الواحدة بفقاعة تحميل واحدة لكل خانة، بنفس
      // الترتيب، ثم نملأ كل وحدة بمجرد جاهزيتها (بالتوازي، دون انتظار بعضها
      // البعض).
      final placeholders = [
        for (final slot in slots)
          ChatMessage(
            text: slot.length > 1
                ? 'أدوّر على ${slot.map((i) => i.label).toSet().join(' و')}…'
                : switch (slot.first.kind) {
                    IntentKind.deals => 'أشوف العروض القريبة…',
                    IntentKind.professional => 'أدوّر لك على أقرب ${slot.first.label}…',
                    IntentKind.place => 'أدوّر على ${slot.first.label}…',
                    IntentKind.order => 'أجهّز طلبك من ${slot.first.placeName ?? slot.first.label}…',
                  },
            sender: MessageSender.bot,
            isLoading: true,
            understandingIntent: slot.first,
          ),
      ];

      setState(() {
        _messages.removeLast(); // إزالة رسالة "يبحث..." الأولية
        _messages.addAll(placeholders);
      });
      final startIndex = _messages.length - placeholders.length;
      _scrollToBottom();

      final futures = <Future<void>>[];
      for (var i = 0; i < slots.length; i++) {
        final index = startIndex + i;
        final slot = slots[i];
        // كل نوايا الخانة تُحلّ بنفس الـindex عمداً: ردود النتيجة (فتح
        // السلّة مثلاً) تستبدل فقاعتها بمكانها، وفقاعة الخانة واحدة مهما
        // كان عدد نواياها.
        final resolveFuture = slot.length > 1
            ? Future.wait([for (final intent in slot) _resolveOne(text, intent, origin, usedFallback, index)])
                .then((messages) => _mergePlaceMessages(slot, messages))
            : _resolveOne(text, slot.first, origin, usedFallback, index);
        futures.add(
          resolveFuture.then((message) {
            if (!mounted) return;
            setState(() => _messages[index] = message);
            _scrollToBottom();
          }),
        );
      }
      await Future.wait(futures);

      for (final intent in intents) {
        if (intent.kind == IntentKind.place && intent.slug != null) {
          await _sessionMemory.saveLastCategorySlug(intent.slug!);
          break;
        }
      }

      if (origin.offerSaveHome && mounted) {
        setState(() {
          _messages.add(ChatMessage(
            text: 'تبي أحفظ موقعك الحالي كـ«بيتي» عشان أستخدمه في طلباتك الجاية؟',
            sender: MessageSender.bot,
            actionLabel: 'احفظ موقعي كبيتي',
            onAction: () async {
              await _sessionMemory.saveHome(origin.lat, origin.lng);
              if (!mounted) return;
              setState(() {
                _messages.add(ChatMessage(
                  text: 'تمام ✅ حفظت موقعك كـ«بيتي».',
                  sender: MessageSender.bot,
                ));
              });
              _scrollToBottom();
            },
          ));
        });
      }
    } on LocationException catch (e) {
      // فشل تحديد نقطة الانطلاق نفسها (قبل إنشاء فقاعات النوايا) — يوقف
      // الرد كاملاً لأن كل النوايا تعتمد على الموقع.
      setState(() {
        _messages.removeLast();
        _messages.add(ChatMessage(
          text: e.message,
          sender: MessageSender.bot,
          actionLabel: e.type == LocationErrorType.unknown ? null : 'فتح الإعدادات',
          onAction: switch (e.type) {
            LocationErrorType.serviceDisabled => () => Geolocator.openLocationSettings(),
            LocationErrorType.permissionDenied || LocationErrorType.permissionDeniedForever => () =>
                Geolocator.openAppSettings(),
            LocationErrorType.unknown => null,
          },
        ));
      });
    } catch (e) {
      setState(() {
        _messages.removeLast();
        _messages.add(ChatMessage(
          text: 'صار خطأ ما كنت متوقعه، حاول مرة ثانية 😕',
          sender: MessageSender.bot,
        ));
      });
    } finally {
      setState(() => _sending = false);
      _scrollToBottom();
      unawaited(_sessionMemory.saveTranscript(_persistableMessages));
    }
  }

  /// يرد على سؤال الجو من القراءة المحفوظة، ويضيف سطر الاقتراح إن وُجد —
  /// فيصير الرد جواباً ودعوة لخطوة تالية بدل معلومة معلّقة.
  Future<void> _answerWeatherQuestion(String text) async {
    setState(() {
      _messages.add(ChatMessage(text: text, sender: MessageSender.user));
      _sending = true;
    });
    _controller.clear();
    _scrollToBottom();

    await _refreshWeather();
    final weather = _weather;

    setState(() {
      _messages.add(ChatMessage(
        // بلا موقع أو بلا قراءة ما نخترع جواباً — نقولها صراحة ونعرض ما نقدر
        // عليه فعلاً، تماماً مثل بقية حالات تعذّر الموقع.
        text: weather == null
            ? 'ما قدرت أعرف حالة الجو عندك الحين 😕 بس أقدر أدلّك على أقرب مكان أو عرض.'
            : [
                weather.descriptionAr,
                if (weather.suggestion != null) weather.suggestion!.line,
              ].join(' — '),
        sender: MessageSender.bot,
      ));
      _sending = false;
    });
    _scrollToBottom();
    unawaited(_sessionMemory.saveTranscript(_persistableMessages));
  }

  /// يحوّل تسجيل المستخدم إلى نص ويرسله فوراً — بلا ضغطة إرسال ثانية.
  ///
  /// مستخدم الصوت اختار ألا يكتب أصلاً، فإيقافه عند حقل ممتلئ ينتظر ضغطة
  /// يلغي فائدة المايك. النص يظهر في فقاعة المستخدم على كل حال، فإن أخطأ
  /// التحويل يبان الخطأ ويُعاد الطلب بدل ما ينتظر مراجعة قبل كل إرسال.
  Future<void> _handleRecorded(String filePath) async {
    if (_transcribing || _sending) return;
    setState(() => _transcribing = true);

    // نفس منطق [BackendWarmup] مع الكتابة: مستخدم الصوت ما يكتب أبداً، فبدون
    // هالنداء يوصل أول تسجيل لخادم نايم فيدفع زمن الإيقاظ فوق زمن التحويل.
    BackendWarmup.ping();

    var transcribed = false;
    try {
      final result = await _transcribeService.transcribe(filePath);
      if (!mounted) return;

      switch (result.status) {
        case TranscriptionStatus.ok:
          _controller.text = result.text;
          _controller.selection = TextSelection.collapsed(offset: result.text.length);
          transcribed = true;
        case TranscriptionStatus.noSpeech:
          _showBotNote('ما سمعتك زين 🎙 قرّب الجوال شوي وجرّب مرة ثانية.');
        case TranscriptionStatus.failed:
          _showBotNote('ما قدرت أحوّل صوتك لنص الحين 😕 جرّب مرة ثانية أو اكتب طلبك.');
      }
    } finally {
      // المقطع مرفوع وانتهى دوره — ما نخلي تسجيلات المستخدم قاعدة بالجهاز.
      unawaited(VoiceRecordingService.deleteFile(filePath));
      if (mounted) setState(() => _transcribing = false);
    }

    // الإرسال بعد إطفاء [_transcribing] لا داخله: [_handleSend] يمسك حالة
    // الانشغال بنفسه، ولو تداخلت الحالتان لبقي المؤلّف معطّلاً بعد الرد.
    if (transcribed) await _handleSend();
  }

  /// رُفض إذن المايك أو تعذّر تشغيله — نفس أسلوب رسائل الموقع: سبب مفهوم
  /// وزر يوصل لمكان الحل بدل ما نترك المستخدم يدوّر بالإعدادات.
  void _handleMicUnavailable() {
    _showBotNote(
      'محتاج إذن المايكروفون عشان أسمع طلبك 🎙',
      actionLabel: 'فتح الإعدادات',
      onAction: () => Geolocator.openAppSettings(),
    );
  }

  /// ملاحظة قصيرة من ريكو داخل المحادثة (لا نتائج معها) — أنسب من SnackBar
  /// لأن كل كلام ريكو الثاني يوصل كفقاعة.
  void _showBotNote(String text, {String? actionLabel, VoidCallback? onAction}) {
    setState(() {
      _messages.add(ChatMessage(
        text: text,
        sender: MessageSender.bot,
        actionLabel: actionLabel,
        onAction: onAction,
      ));
    });
    _scrollToBottom();
  }

  /// يُشغَّل من حبات الاقتراح السريع أسفل نتائج البحث (مثل "أبغى أرخص") —
  /// يمرّ عبر نفس خط أنابيب التصنيف الفعلي بدل فلترة وهمية على القائمة
  /// المعروضة، تماماً كما تفعل chips الاقتراحات الأولية أعلى الشاشة.
  void _sendQuickReply(String text) {
    if (_sending) return;
    // حبة اقتراح أثناء تعديل مفتوح = تخلٍّ عن التعديل، لا تعديل بنصها.
    if (_editingMessage != null) setState(() => _editingMessage = null);
    _controller.text = text;
    _handleSend();
  }

  /// يفتح تصفّح منتجات وعروض نشاط حقيقي (source == 'rico') تم اختياره من
  /// نتائج بحث فعلية — يجلبها من rico-backend ويعرضها كبطاقة قابلة للاختيار
  /// ضمن [RequestFlow]، بديلاً حقيقياً لتدفّق الطلب التجريبي القديم.
  Future<void> _openCatalog(PlaceResult place) async {
    final index = _messages.length;
    setState(() {
      _messages.add(ChatMessage(text: 'أجهّز لك قائمة ${place.name}…', sender: MessageSender.bot, isLoading: true));
    });
    _scrollToBottom();

    try {
      final catalog = await _catalogService.fetchCatalog(place.osmId);
      if (catalog.isEmpty) {
        setState(() {
          _messages[index] = ChatMessage(
            text: 'ما لقيت منتجات أو عروض متوفرة لـ ${place.name} الحين 😕',
            sender: MessageSender.bot,
          );
        });
        return;
      }

      setState(() {
        _messages[index] = ChatMessage(
          text: 'هذي منتجات وعروض ${place.name}، أضف اللي تبغاه للسلّة:',
          sender: MessageSender.bot,
          requestFlow: RequestFlow(catalog: catalog),
          catalogActions: _catalogActionsFor(index),
        );
      });
    } on CatalogException catch (e) {
      setState(() => _messages[index] = ChatMessage(text: e.message, sender: MessageSender.bot));
    } catch (_) {
      setState(() =>
          _messages[index] = ChatMessage(text: 'ما قدرت أجيب المنتجات والعروض الحين 😕', sender: MessageSender.bot));
    } finally {
      _scrollToBottom();
    }
  }

  /// أفعال بطاقة المتجر لرسالة بعينها — تُبنى مرة واحدة هنا لأن للسلّة الآن
  /// مدخلين: تصفّح المستخدم للقائمة بنفسه، وطلب منطوق جهّزناه له.
  /// يضيف صنفاً اقترحناه («تقصد أرز بحليب؟») للسلّة عند ضغط حبّته.
  ///
  /// يحل المعرّف من الكتالوج الواصل مع الرد نفسه بدل ما يطلبه من جديد، ويشيل
  /// الحبّة بعد الإضافة — السؤال انجاوب، فعرضه مرة ثانية يخلي المستخدم يشك
  /// إذا ضغطته أصلاً.
  void _addSuggestion(int index, OrderSuggestion suggestion) {
    if (index >= _messages.length) return;
    final message = _messages[index];
    final catalog = message.requestFlow?.catalog;
    if (catalog == null) return;

    final remaining = (message.orderSuggestions ?? const <OrderSuggestion>[])
        .where((s) => s.itemId != suggestion.itemId)
        .toList();

    if (suggestion.itemType == 'deal') {
      final deals = catalog.deals.where((d) => d.id == suggestion.itemId);
      if (deals.isEmpty) return;
      _updateFlow(index, (f) => f.copyWith(cart: f.cart.add(CartLine.fromDeal(deals.first)), clearError: true));
    } else {
      final products = catalog.products.where((p) => p.id == suggestion.itemId);
      if (products.isEmpty) return;
      _updateFlow(index, (f) => f.copyWith(cart: f.cart.add(CartLine.fromProduct(products.first)), clearError: true));
    }

    if (!mounted) return;
    setState(() => _messages[index] = _messages[index].copyWith(orderSuggestions: remaining));
  }

  CatalogFlowActions _catalogActionsFor(int index) {
    return CatalogFlowActions(
      onAddProduct: (product) => _updateFlow(index, (f) => f.copyWith(
            cart: f.cart.add(CartLine.fromProduct(product)),
            clearError: true,
          )),
      onAddDeal: (deal) => _updateFlow(index, (f) => f.copyWith(
            cart: f.cart.add(CartLine.fromDeal(deal)),
            clearError: true,
          )),
      onSetQuantity: (type, id, quantity) => _setCartQuantity(index, type, id, quantity),
      onReview: () => _updateFlow(index, (f) => f.copyWith(stage: RequestFlowStage.confirming, clearError: true)),
      onSelectCategory: (category) => _updateFlow(
        index,
        (f) => category == null
            ? f.copyWith(clearCategory: true, showAllProducts: false)
            : f.copyWith(activeCategory: category, showAllProducts: false),
      ),
      onToggleShowAll: () => _updateFlow(index, (f) => f.copyWith(showAllProducts: !f.showAllProducts)),
      onConfirm: () => _confirmRequest(index),
      onRequestLogin: () => _signInThenConfirm(index),
      onBack: () => _updateFlow(index, (f) => f.copyWith(stage: RequestFlowStage.browsing, clearError: true)),
    );
  }

  /// "بدي أطلب من مطعم الماهر كنافة نابلسية وأرز بحليب" — يحلّ المحل، يطابق
  /// الأصناف مع قائمته الحقيقية، ويفتح السلّة جاهزة على خطوة المراجعة.
  ///
  /// الأصناف غير الموجودة تُقال صراحةً في نص الرسالة. السكوت عنها أسوأ عطل
  /// ممكن هنا: المستخدم يضغط "أكّد" وهو يظن أن الأربعة كلها بالسلّة، وما يكتشف
  /// نقص اثنين إلا حين يتصل المحل.
  Future<ChatMessage> _resolveOrderMessage(QueryIntent intent, int index) async {
    final placeName = intent.placeName;
    if (placeName == null) {
      return ChatMessage(text: 'ما فهمت من وين تبي تطلب، قل لي اسم المحل 👌', sender: MessageSender.bot);
    }

    ResolvedOrder resolved;
    try {
      resolved = await _catalogService.resolveOrder(placeName: placeName, items: intent.orderItems);
    } on CatalogException catch (e) {
      return ChatMessage(text: e.message, sender: MessageSender.bot);
    } catch (_) {
      return ChatMessage(text: 'ما قدرت أجهّز طلبك الحين 😕', sender: MessageSender.bot);
    }

    final catalog = resolved.catalog;
    if (catalog == null) {
      return ChatMessage(
        text: 'ما لقيت محل باسم "$placeName" 😕 جرّب تكتب اسمه كامل، أو قل لي وش تبي وأنا أدوّر لك على أقرب محل.',
        sender: MessageSender.bot,
      );
    }

    final shop = resolved.businessName ?? placeName;
    final missing = resolved.unmatched;

    // سمّى المحل بلا أصناف — يبي يشوف قائمتهم، فنفتحها على التصفّح.
    if (intent.orderItems.isEmpty) {
      return ChatMessage(
        text: 'هذي قائمة $shop، أضف اللي تبغاه للسلّة:',
        sender: MessageSender.bot,
        requestFlow: RequestFlow(catalog: catalog),
        catalogActions: _catalogActionsFor(index),
      );
    }

    // ولا صنف تطابق: نفتح القائمة على التصفّح بدل ما نوقفه عند رسالة خطأ —
    // هو أصلاً يبي يطلب من هذا المحل.
    if (resolved.foundNothing) {
      final suggestions = resolved.suggestions;
      return ChatMessage(
        text: suggestions.isEmpty
            ? 'ما لقيت ${_itemsPhrase(missing)} في $shop 😕 هذي قائمتهم إذا تبي تختار منها:'
            : 'ما لقيت ${_itemsPhrase(missing)} في $shop، بس أقرب شي عندهم '
                '${_itemsPhrase(suggestions.map((s) => s.label).toList())} — تبيه؟',
        sender: MessageSender.bot,
        orderSuggestions: suggestions.isEmpty ? null : suggestions,
        onAddSuggestion: (suggestion) => _addSuggestion(index, suggestion),
        requestFlow: RequestFlow(catalog: catalog),
        catalogActions: _catalogActionsFor(index),
      );
    }

    final cart = Cart(
      lines: resolved.matched
          .map((m) => CartLine(
                itemType: m.itemType,
                itemId: m.itemId,
                label: m.label,
                detail: m.detail,
                unitPrice: m.unitPrice,
                imageUrl: m.imageUrl,
                quantity: m.quantity,
              ))
          .toList(),
    );

    // لما يكون عندنا بديل قريب نسأل عنه بدل ما نكتفي بـ"ما لقيت": الصنف
    // الناقص صار سؤالاً له جواب بضغطة، لا طريقاً مسدوداً يرجّع المستخدم
    // يتصفّح القائمة كلها بنفسه.
    final suggestions = resolved.suggestions;
    final text = missing.isEmpty
        ? 'جهّزت لك طلبك من $shop — راجعه وأكّده 👇'
        : suggestions.isEmpty
            ? 'جهّزت اللي لقيته من $shop. بس ما لقيت ${_itemsPhrase(missing)} عندهم — راجع الطلب وأكّده 👇'
            : 'جهّزت اللي لقيته من $shop. ما لقيت ${_itemsPhrase(missing)} عندهم — '
                'أقرب شي عندهم ${_itemsPhrase(suggestions.map((s) => s.label).toList())}، تبيه؟';

    return ChatMessage(
      text: text,
      sender: MessageSender.bot,
      orderSuggestions: suggestions.isEmpty ? null : suggestions,
      onAddSuggestion: (suggestion) => _addSuggestion(index, suggestion),
      // مباشرة على المراجعة: هو قال وش يبي، فالخطوة الباقية تأكيد لا تصفّح.
      requestFlow: RequestFlow(catalog: catalog, cart: cart, stage: RequestFlowStage.confirming),
      catalogActions: _catalogActionsFor(index),
    );
  }

  /// "كنافة" / "كنافة وأرز بحليب" / "كنافة وأرز بحليب و٢ غيرها" — عربية تُقرأ،
  /// لا قائمة مفصولة بفواصل.
  static String _itemsPhrase(List<String> names) {
    if (names.isEmpty) return '';
    if (names.length == 1) return '"${names.first}"';
    final quoted = names.map((n) => '"$n"').toList();
    return '${quoted.sublist(0, quoted.length - 1).join('، ')} و${quoted.last}';
  }

  /// تعديل موضعي على تدفّق طلبٍ داخل رسالة بعينها — كل أفعال بطاقة المتجر
  /// تمرّ من هنا، فيبقى التحقّق من وجود الرسالة وحالتها في مكان واحد.
  ///
  /// لا [_scrollToBottom] هنا عمداً: إضافة منتج لا تغيّر ارتفاع البطاقة، وقفزُ
  /// المحادثة مع كل ضغطة "أضف" يسحب الشبكة من تحت إصبع المستخدم.
  void _updateFlow(int index, RequestFlow Function(RequestFlow flow) update) {
    if (index >= _messages.length) return;
    final current = _messages[index];
    final flow = current.requestFlow;
    if (flow == null) return;
    setState(() => _messages[index] = current.copyWith(requestFlow: update(flow)));
  }

  /// تفريغ السلّة من المراجعة يعيد المستخدم للتصفّح بدل أن يتركه أمام سلّة
  /// فارغة وزر تأكيد لا يرسل شيئاً.
  void _setCartQuantity(int index, String itemType, String itemId, int quantity) {
    _updateFlow(index, (flow) {
      final cart = flow.cart.setQuantity(itemType, itemId, quantity);
      final backToBrowsing = cart.isEmpty && flow.stage == RequestFlowStage.confirming;
      return flow.copyWith(
        cart: cart,
        stage: backToBrowsing ? RequestFlowStage.browsing : null,
        clearError: true,
      );
    });
  }

  /// يفتح ورقة الدخول من داخل بطاقة الطلب، ويكمل التأكيد تلقائياً عند
  /// نجاحه — الدخول خطوة في الطلب، فلا يُطلب من المستخدم ضغط "أكّد" مرتين.
  Future<void> _signInThenConfirm(int index) async {
    final signedIn = await showAuthSheet(
      context,
      reason: 'سجّل دخولك عشان نوصّل طلبك للمحل باسمك ورقمك.',
    );
    if (!mounted || !signedIn) return;
    await _confirmRequest(index);
  }

  Future<void> _confirmRequest(int index) async {
    if (index >= _messages.length) return;
    final current = _messages[index];
    final flow = current.requestFlow;
    if (flow == null || flow.cart.isEmpty) return;

    // حارس أخير: البطاقة تعرض زر الدخول للزائر أصلاً، لكن الجلسة قد تنتهي
    // بين فتح البطاقة والضغط على "أكّد".
    final customer = AuthStore.instance.customer;
    final token = AuthStore.instance.token;
    if (customer == null || token == null) {
      await _signInThenConfirm(index);
      return;
    }

    setState(() {
      _messages[index] = current.copyWith(
        requestFlow: flow.copyWith(
          stage: RequestFlowStage.submitting,
          customerName: customer.name,
          customerPhone: customer.phone,
          clearError: true,
        ),
      );
    });

    try {
      await _requestService.submitRequest(
        businessId: flow.catalog.businessId,
        token: token,
        items: flow.cart.toRequestItems(),
      );
      if (!mounted) return;
      setState(() {
        final latest = _messages[index];
        _messages[index] = latest.copyWith(
          requestFlow: latest.requestFlow!.copyWith(stage: RequestFlowStage.submitted),
        );
      });
    } on RequestException catch (e) {
      if (!mounted) return;
      setState(() {
        final latest = _messages[index];
        _messages[index] = latest.copyWith(
          requestFlow: latest.requestFlow!.copyWith(stage: RequestFlowStage.confirming, errorMessage: e.message),
        );
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        final latest = _messages[index];
        _messages[index] = latest.copyWith(
          requestFlow: latest.requestFlow!.copyWith(
            stage: RequestFlowStage.confirming,
            errorMessage: 'ما قدرت أرسل طلبك الحين، حاول مرة ثانية.',
          ),
        );
      });
    } finally {
      _scrollToBottom();
    }
  }

  /// زر الحساب في الترويسة: ملف المستخدم إن كان داخلاً، وإلا ورقة الدخول.
  /// الدخول من هنا اختياري تماماً — التطبيق يُفتح ويُستخدم بلا حساب، ولا
  /// يُطلب الحساب إلا عند تأكيد طلب فعلي.
  Future<void> _openAccount() async {
    if (AuthStore.instance.isSignedIn) {
      await showAccountSheet(context);
      return;
    }
    await showAuthSheet(context);
  }

  @override
  Widget build(BuildContext context) {
    // محادثة فارغة (جلسة جديدة أو انقضت صلاحية المحفوظة) = شاشة الهوية
    // والاقتراحات، لا قائمة رسائل فيها فقاعة ترحيب وحيدة.
    final showWelcome = _messages.isEmpty;

    return Scaffold(
      backgroundColor: RicoColors.canvas,
      appBar: ChatHeader(
        elevated: _headerElevated && !showWelcome,
        onOpenFavorites: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const FavoritesScreen()),
        ),
        onOpenAccount: _openAccount,
      ),
      body: Column(
        children: [
          Expanded(
            child: showWelcome
                ? WelcomeHero(onPickSuggestion: _sendQuickReply, weather: _weather)
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.only(top: 14, bottom: 16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      return MessageBubble(
                        message: message,
                        showAvatar: _startsBotGroup(index),
                        // التعديل لرسائل المستخدم وحدها، ومعطّل أثناء انشغال
                        // ريكو — تعديل سؤال وجوابه لسه جاي يترك المحادثة نصّين.
                        onEdit: message.sender == MessageSender.user && !_sending && !_transcribing
                            ? () => _beginEditMessage(message)
                            : null,
                        editing: identical(message, _editingMessage),
                      );
                    },
                  ),
          ),
          ChatComposer(
            controller: _controller,
            onSend: _handleSend,
            busy: _sending || _transcribing,
            onRecorded: _handleRecorded,
            onMicUnavailable: _handleMicUnavailable,
            editing: _editingMessage != null,
            onCancelEdit: _cancelEditMessage,
            // شريط الاقتراحات يفيد في المحادثة الجارية؛ شاشة الترحيب تعرض
            // اقتراحاتها الخاصة بمساحة أوسع، فلا داعي لتكرارها.
            suggestions: showWelcome ? null : SuggestionRail(onPick: _sendQuickReply),
          ),
        ],
      ),
    );
  }

  /// أول رسالة من ريكو في سلسلة رسائله المتتالية — هي وحدها تحمل صورته، فلا
  /// تتكرر الأيقونة في كل سطر من ردٍّ واحد وصل على عدة فقاعات.
  bool _startsBotGroup(int index) {
    if (_messages[index].sender != MessageSender.bot) return false;
    if (index == 0) return true;
    return _messages[index - 1].sender != MessageSender.bot;
  }
}
