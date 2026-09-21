/// حالة العميل كما قرأها المصنّف من رسالته (ومن نبرته إن كانت صوتاً).
///
/// المزاج **تعليمة عرض، لا تعليمة بحث**: يغيّر كم نتيجة نعرض وكم نطوّل
/// بالكلام، وما يمسّ أبداً وش بحثنا عنه. فقراءة خاطئة أسوأ ما تسويه إنها
/// تخلّي الرد أقصر أو أطول من اللازم — ما تجيب للمستخدم جواب سؤال ثاني.
enum CustomerMood {
  /// الحالة الافتراضية والأغلب — سلوك ريكو كما كان قبل هذي الميزة بالضبط.
  neutral,

  /// مستعجل أو بموقف ما يستنى (تسريب مياه، عطل بالطريق).
  urgent,

  /// متضايق أو يشتكي.
  angry,

  /// ما حسم وش يبي، يطلب رأياً لا نتيجة.
  hesitant,

  /// مبسوط أو شاكر.
  happy;

  static CustomerMood fromString(String? raw) => switch (raw) {
        'urgent' => CustomerMood.urgent,
        'angry' => CustomerMood.angry,
        'hesitant' => CustomerMood.hesitant,
        'happy' => CustomerMood.happy,
        _ => CustomerMood.neutral,
      };

  String get wireValue => name;

  /// المستعجل والغاضب لهما نفس المعاملة بالعرض — الفرق بينهما في نبرة الرد
  /// النصّي (اعتذار قصير للغاضب)، وهذا شغل الخادم لا العميل.
  bool get wantsItShort => this == CustomerMood.urgent || this == CustomerMood.angry;

  /// كم نتيجة نعرض فعلياً من اللي رجعت.
  ///
  /// المستعجل يشوف وحدة: عرض ست خيارات على واحد واقف فوق تسريب مياه يحوّل
  /// الجواب لواجب ثاني عليه. والمتردد يشوف أكثر لأن مشكلته أصلاً إنه ما
  /// عنده وش يقارن بينه. و[null] معناها اعرض كل اللي وصل بلا قص.
  int? get placeLimit => switch (this) {
        CustomerMood.urgent || CustomerMood.angry => 1,
        CustomerMood.hesitant => 6,
        CustomerMood.neutral || CustomerMood.happy => null,
      };

  /// سطر الجو لطيف بالوضع العادي، وحشو مزعج لواحد مستعجل — فما نبعث الموقع
  /// أصلاً للخادم بهذي الحالة بدل ما نعتمد على إنه يلتزم بالتعليمات.
  bool get allowsWeatherLine => !wantsItShort;

  /// حبّات «أبغى أرخص / الأقرب لي / ورّني غيرها» تحت النتائج. تُخفى عن
  /// المستعجل وحده: هي دعوة لتوسيع البحث من جديد، وهذا آخر شي يحتاجه واحد
  /// يبي يتصرّف الحين. تبقى للبقية كما كانت، وهي بالضبط اللي يحتاجها
  /// المتردد ليقارن.
  bool get showsQuickReplyChips => !wantsItShort;
}
