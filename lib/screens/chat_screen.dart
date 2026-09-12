import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../models/chat_message.dart';
import '../models/deal.dart';
import '../models/place_result.dart';
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
import '../services/request_service.dart';
import '../services/search_gap_service.dart';
import '../services/session_memory_service.dart';
import '../services/transcribe_service.dart';
import '../services/voice_recording_service.dart';
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

class _ChatScreenState extends State<ChatScreen> {
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

  static final RegExp _homeMention = RegExp('بيتي|منزلي|البيت');

  Position? _cachedPosition;
  bool _sending = false;

  /// جارٍ تحويل مقطع صوتي إلى نص — يُعطّل المؤلّف كما يفعل [_sending]، لكنه
  /// حالة مستقلة عنه لأنه يسبق الإرسال ولا يضيف فقاعة للمحادثة.
  bool _transcribing = false;

  /// هل نزل المستخدم عن أعلى المحادثة؟ يفعّل ظل الترويسة فقط عند الحاجة.
  bool _headerElevated = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // نوقظ الخادم من أول لحظة (ومرة ثانية عند بدء الكتابة) عشان يكون صاحياً
    // وقت أول سؤال — وإلا تفشل مهلة التصنيف الذكي ويسقط الفهم للكلمات
    // المفتاحية. انظر [BackendWarmup].
    BackendWarmup.ping();
    _controller.addListener(BackendWarmup.ping);
    _restoreConversation();
  }

  @override
  void dispose() {
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
  List<ChatMessage> get _persistableMessages =>
      _messages.where((m) => !m.isLoading && m.text.isNotEmpty && m.requestFlow == null).toList();

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
  Future<ChatMessage?> _resolveReferencedMessage(String text, QueryIntent intent, int position) async {
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

  /// يحل نية واحدة (مكان أو عروض) إلى رسالة رد جاهزة، مع عزل الأخطاء داخل
  /// النية نفسها (فشل نية واحدة من عدة نوايا في نفس الرسالة لا يوقف البقية).
  Future<ChatMessage> _resolveIntentMessage(
    String text,
    QueryIntent intent,
    ({double lat, double lng, bool offerSaveHome}) origin,
    bool usedFallback,
  ) async {
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

  Future<void> _handleSend() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

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
        if (!IntentService.hasPlaceOrDealsSignal(text, lastCategorySlug: lastCategorySlug)) {
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

      final origin = await _resolveOrigin(text);

      // نستبدل رسالة "يبحث..." الواحدة بفقاعة تحميل واحدة لكل نية مستقلة،
      // بنفس ترتيب النوايا، ثم نملأ كل واحدة بمجرد جاهزيتها (بالتوازي، دون
      // انتظار بعضها البعض) — هذا ما يجعل الرد على رسالة مركّبة (مثل "أقرب
      // مطعم أو أرخص كافيه، وايش العروض المتوفرة؟") يظهر كفقاعات منفصلة.
      final placeholders = [
        for (final intent in intents)
          ChatMessage(
            text: intent.kind == IntentKind.deals ? 'أشوف العروض القريبة…' : 'أدوّر على ${intent.label}…',
            sender: MessageSender.bot,
            isLoading: true,
            understandingIntent: intent,
          ),
      ];

      setState(() {
        _messages.removeLast(); // إزالة رسالة "يبحث..." الأولية
        _messages.addAll(placeholders);
      });
      final startIndex = _messages.length - placeholders.length;
      _scrollToBottom();

      final futures = <Future<void>>[];
      for (var i = 0; i < intents.length; i++) {
        final index = startIndex + i;
        final referencedPosition = intents[i].referencedPosition;
        // إشارة لعنصر محدد من آخر نتائج (مثل "الثاني") تُحل من الذاكرة
        // المحلية أولاً بدون بحث شبكي جديد؛ إن لم تعد قابلة للحل (تغيّرت
        // القائمة) نسقط تلقائياً لمسار البحث العادي.
        final resolveFuture = referencedPosition != null
            ? _resolveReferencedMessage(text, intents[i], referencedPosition).then((message) async {
                return message ?? await _resolveIntentMessage(text, intents[i], origin, usedFallback);
              })
            : _resolveIntentMessage(text, intents[i], origin, usedFallback);
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

  /// يحوّل تسجيل المستخدم إلى نص ويحطه في حقل الكتابة — بلا إرسال تلقائي.
  ///
  /// النص يظهر للمستخدم قبل الإرسال عن قصد: تحويل الكلام باللهجة يخطئ أحياناً،
  /// ونظرة سريعة على «أقرب صيدلية» قبل الضغط أرخص بكثير من بحث غلط + نداء
  /// تصنيف مصروف على طلب ما قاله أصلاً.
  Future<void> _handleRecorded(String filePath) async {
    if (_transcribing || _sending) return;
    setState(() => _transcribing = true);

    // نفس منطق [BackendWarmup] مع الكتابة: مستخدم الصوت ما يكتب أبداً، فبدون
    // هالنداء يوصل أول تسجيل لخادم نايم فيدفع زمن الإيقاظ فوق زمن التحويل.
    BackendWarmup.ping();

    try {
      final result = await _transcribeService.transcribe(filePath);
      if (!mounted) return;

      switch (result.status) {
        case TranscriptionStatus.ok:
          _controller.text = result.text;
          _controller.selection = TextSelection.collapsed(offset: result.text.length);
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
          text: 'هذي منتجات وعروض ${place.name}، اختر اللي يعجبك:',
          sender: MessageSender.bot,
          requestFlow: RequestFlow(catalog: catalog),
          onSelectCatalogItem: (type, id, label, detail) => _selectCatalogItem(index, type, id, label, detail),
          onConfirmRequest: () => _confirmRequest(index),
          onRequestLogin: () => _signInThenConfirm(index),
          onCancelCatalogSelection: () => _cancelCatalogSelection(index),
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

  void _selectCatalogItem(int index, String itemType, String itemId, String label, String? detail) {
    if (index >= _messages.length) return;
    final current = _messages[index];
    final flow = current.requestFlow;
    if (flow == null) return;
    setState(() {
      _messages[index] = current.copyWith(
        requestFlow: flow.copyWith(
          stage: RequestFlowStage.confirming,
          selectedItemType: itemType,
          selectedItemId: itemId,
          selectedItemLabel: label,
          selectedItemDetail: detail,
          clearError: true,
        ),
      );
    });
    _scrollToBottom();
  }

  void _cancelCatalogSelection(int index) {
    if (index >= _messages.length) return;
    final current = _messages[index];
    final flow = current.requestFlow;
    if (flow == null) return;
    setState(() {
      _messages[index] = current.copyWith(
        requestFlow: flow.copyWith(stage: RequestFlowStage.browsing, clearSelection: true, clearError: true),
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
    if (flow == null || flow.selectedItemType == null || flow.selectedItemId == null) return;

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
        itemType: flow.selectedItemType!,
        itemId: flow.selectedItemId!,
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
                ? WelcomeHero(onPickSuggestion: _sendQuickReply)
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.only(top: 14, bottom: 16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) => MessageBubble(
                      message: _messages[index],
                      showAvatar: _startsBotGroup(index),
                    ),
                  ),
          ),
          ChatComposer(
            controller: _controller,
            onSend: _handleSend,
            busy: _sending || _transcribing,
            onRecorded: _handleRecorded,
            onMicUnavailable: _handleMicUnavailable,
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
