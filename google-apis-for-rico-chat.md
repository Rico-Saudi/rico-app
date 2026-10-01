# واجهات Google Maps Platform لدردشة ريكو — التكلفة، الاستخدام، والفائدة

مكتوب لفريق ريكو. يغطي كل واجهة (API) من Google Maps Platform يمكن ربطها بدردشة
ريكو، وكم تكلّف في 2026، وأيها يستحق الربط فعلاً. الأسعار بالدولار لكل 1,000
طلب بالتسعيرة القياسية (غير تسعيرة الهند).

> أسماء الحقول (`places.rating`) وأسماء الـSKU ومسارات الملفات تُركت بالإنجليزي
> لأنها معرّفات حرفية في الكود وفي توثيق Google — ترجمتها تكسر البحث عنها.

---

## ١. وين ريكو حالياً

ريكو يستدعي Google Places API (New) من مكان واحد:
[google-places.adapter.ts](server/rico-backend/src/integrations/google-places.adapter.ts).

يشترك في استخدامه مستهلكان — مزامنة المصادر من لوحة المالك
([owner.service.ts](server/rico-backend/src/owner/owner.service.ts))، والبحث
الاحتياطي المباشر
([search.service.ts:191](server/rico-backend/src/search/search.service.ts#L191)) —
خلف عدّاد شهري واحد
([api-usage.service.ts](server/rico-backend/src/api-usage/api-usage.service.ts)).

قناع الحقول (field mask) في
[google-places.adapter.ts:65-75](server/rico-backend/src/integrations/google-places.adapter.ts#L65-L75)
يطلب `rating` و`priceLevel` و`nationalPhoneNumber` و`regularOpeningHours`.
هذي حقول **من فئة Enterprise**، وGoogle تحاسبك على كل طلب بأعلى فئة يقع فيها أي
حقل طلبته. يعني كل استدعاء في ريكو اليوم يُحاسَب على:

| نقطة النهاية المستخدمة | الـSKU | مجاني/شهر | بعدها |
|---|---|---|---|
| `searchNearby` | Nearby Search Enterprise | 1,000 | $35 / 1K |
| `searchText` | Text Search Enterprise | 1,000 | $35 / 1K |

التعليق المكتوب داخل الكود واللي يقول "1,000 free/month, then $35/1000"
**صحيح**.

أما `server/rico-api/src/adapters/google_places.js` فهو خادم Express القديم —
كود ميت، آخر تعديل عليه بالـcommit رقم `26bba2d`. تجاهله، الشغّال هو
`rico-backend`.

### الاكتشاف: السقف عندكم 200 بينما المجاني 2,000

`DEFAULT_GOOGLE_PLACES_MONTHLY_CAP = 200`
([adapter:10](server/rico-backend/src/integrations/google-places.adapter.ts#L10))
عدّاد واحد مشترك بين نقطتي النهاية. لكن Nearby Search Enterprise و
Text Search Enterprise **SKU منفصلان ولكل واحد سقف مجاني مستقل** — 1,000 لكل
واحد. يعني الرصيد المجاني الحقيقي لريكو **2,000 استدعاء شهرياً**، وأنتم تستخدمون
200 منها بالكثير.

فاتورة Google الحالية: **$0 شهرياً**. المتبقي غير المستغل: **1,800 استدعاء
شهرياً**، وبمعدل 20 مكان لكل استدعاء يعني حتى 36,000 مكان شهرياً، مجاناً.

**الحل:** اجعل العدّاد لكل SKU على حدة (`google_places:text`،
`google_places:nearby`) في
[api-usage.service.ts](server/rico-backend/src/api-usage/api-usage.service.ts)
وارفع كل سقف إلى ~900. بلا أي تكلفة، وبتغطية للبحث المباشر تقارب ٩ أضعاف الحالية.

---

## ٢. قائمة أسعار الـSKU كاملة (2026)

أوقفت Google رصيد الـ$200 الشهري الثابت في مارس 2025. الآن **كل SKU له سقف
مجاني خاص فيه**: 10,000 شهرياً لفئة Essentials، و5,000 لـPro، و1,000 لـ
Enterprise. والسقوف **لا تتجمّع** مع بعضها.

### Places API (New)

| الـSKU | مجاني/شهر | السعر /1K | وش تحصل عليه |
|---|---|---|---|
| **Text Search (IDs Only)** | **بلا حد** | **$0.00** | معرّفات الأماكن فقط — فحص وجود مجاني |
| **Place Details (IDs Only)** | **بلا حد** | **$0.00** | تحويل المعرّف |
| **Autocomplete (بالجلسة)** | **بلا حد** | **$0.00** | مجاني إذا استخدمت session token ثم Place Details |
| Autocomplete (بالطلب) | 10,000 | $2.83 | إكمال تلقائي بلا جلسة |
| Geocoding | 10,000 | $5.00 | عنوان ⇄ إحداثيات |
| Place Details (Essentials) | 10,000 | $5.00 | العنوان، الموقع، الأنواع |
| Time Zone | 10,000 | $5.00 | |
| Places Aggregate | 5,000 | $10.00 | عدد الأماكن داخل منطقة |
| Address Validation (Pro) | 5,000 | $17.00 | |
| Place Details (Pro) | 5,000 | $17.00 | + displayName، businessStatus |
| **Nearby Search (Pro)** | 5,000 | $32.00 | الاسم/العنوان/الموقع، بلا تقييم |
| **Text Search (Pro)** | 5,000 | $32.00 | نفسها |
| Place Details (Enterprise) | 1,000 | $20.00 | + التقييم، المواعيد، الهاتف، السعر |
| Address Validation (Enterprise) | 1,000 | $25.00 | |
| Place Details + Atmosphere | 1,000 | $25.00 | + المراجعات والمزايا |
| **Place Photos** | 1,000 | **$7.00** | بيانات الصورة الفعلية |
| **Nearby Search (Enterprise)** ← *ريكو* | 1,000 | **$35.00** | + rating، priceLevel، المواعيد، الهاتف |
| **Text Search (Enterprise)** ← *ريكو* | 1,000 | **$35.00** | نفسها |
| **Nearby Search + Atmosphere** | 1,000 | **$40.00** | + توصيل، تيك أواي، جلسة برا، ملخصات |
| **Text Search + Atmosphere** | 1,000 | **$40.00** | نفسها |

### الطرق والمواقع والبيئة

| الـSKU | مجاني/شهر | السعر /1K | ملاحظة |
|---|---|---|---|
| Routes: Compute Routes (Essentials) | 10,000 | $5.00 | لكل طلب |
| Routes: Compute Route Matrix (Essentials) | 10,000 | $5.00 | **لكل عنصر** (نقاط البداية × الوجهات) |
| Routes: Compute Routes (Pro) | 5,000 | $10.00 | يراعي الزحمة |
| Routes: Compute Route Matrix (Pro) | 5,000 | $10.00 | يراعي الزحمة، لكل عنصر |
| Routes (Enterprise) | 1,000 | $15.00 | دراجات نارية، مسارات اقتصادية |
| **Weather** | 10,000 | **$0.15** | أرخص SKU في المنصة كلها |
| Air Quality | 10,000 | $5.00 | |
| Pollen (Pro) | 5,000 | $10.00 | |
| Static Maps | 10,000 | $2.00 | صورة خريطة مصغّرة |
| Dynamic Maps (JS) | 10,000 | $7.00 | |
| **Maps SDK (Android/iOS)** | **بلا حد** | **$0.00** | عرض الخريطة داخل التطبيق مجاني |
| Maps Embed | **بلا حد** | **$0.00** | |

خصومات الحجم تبدأ فوق 100 ألف طلب شهرياً (تقريباً من $35 إلى $2.63 عند 5 مليون+).
غير ذات صلة بحجم ريكو الحالي.

### قاعدة "قناع الحقول ← الـSKU" (هنا يكمن الفلوس)

في Text/Nearby Search، الفئة تتحدد بأغلى حقل تطلبه:

- **IDs Only (مجاني، في Text Search فقط):** `places.id`، `places.name`، `places.photos`، `places.attributions`
- **Pro ($32):** `places.displayName`، `places.formattedAddress`، `places.location`، `places.types`، `places.businessStatus`، `places.googleMapsUri`، `places.primaryType`، `places.viewport`، `places.timeZone`
- **Enterprise ($35):** `places.rating`، `places.userRatingCount`، `places.priceLevel`، `places.priceRange`، `places.nationalPhoneNumber`، `places.internationalPhoneNumber`، `places.websiteUri`، `places.regularOpeningHours`، `places.currentOpeningHours`
- **Enterprise + Atmosphere ($40):** `places.reviews`، `places.reviewSummary`، `places.editorialSummary`، `places.generativeSummary`، `places.neighborhoodSummary`، `places.delivery`، `places.takeout`، `places.dineIn`، `places.curbsidePickup`، `places.serves*`، `places.goodForChildren`، `places.goodForGroups`، `places.hasOutdoorSeating`، `places.reservable`، `places.restroom`، `places.allowsDogs`، `places.parkingOptions`، `places.paymentOptions`، `places.accessibilityOptions`، `places.fuelOptions`، `places.evChargeOptions`

نتيجتان تستاهلان الحفظ:

1. **Nearby Search ما عنده SKU مجاني للـIDs-Only.** أرخص شي فيه هو Pro بـ$32/1K.
   Text Search وحده هو اللي يمكن تشغيله مجاناً.
2. **إذا أنت أصلاً على فئة Enterprise، إضافة حقول Pro أو Essentials مجانية.**
   تعليق الـadapter عندكم يقول هذا الكلام وهو صحيح.

---

## ٣. وش تبنون فعلاً، مرتّب بالأولوية

### المستوى A — سوّوا هذي

#### A1. فصل العدّاد لكل SKU ← ٩ أضعاف السعة المجانية
**التكلفة: $0.** انظر §١. أعلى عائد مقابل عدد أسطر الكود المتغيّرة.

#### A2. ‏Enterprise + Atmosphere — ترقية الدردشة
**التكلفة: +$5/1K (زيادة ١٤٪)، ومع ذلك 1,000 مجانية شهرياً.**

هذي هي اللي تغيّر ماهية دردشة ريكو. حالياً الـprompt الخاص بالتأليف
([compose.service.ts](server/rico-backend/src/compose/compose.service.ts))
يعطي Groq اسماً ومسافة وتقييماً ومستوى سعر. النتيجة: «هذا أقرب مطعم لك، يبعد ٨٠٠
متر.» حقول Atmosphere تخلّيه يجاوب على الأسئلة اللي يسألها المستخدم فعلاً:

| الحقل | وش يفتح في الدردشة |
|---|---|
| `delivery`، `takeout`، `dineIn`، `curbsidePickup` | «يوصّل؟» / «فيه تيك أواي؟» |
| `servesBreakfast/Lunch/Dinner/Coffee/Dessert` | «مطعم يقدم فطور الحين» |
| `servesVegetarianFood` | «مطعم نباتي» |
| `goodForChildren`، `goodForGroups`، `hasMenuForChildren` | «مطعم عائلي» |
| `hasOutdoorSeating`، `liveMusic`، `restroom` | «كافيه فيه جلسة برا» |
| `reservable` | «أقدر أحجز؟» |
| `parkingOptions` | «فيه مواقف؟» |
| `paymentOptions` | «يقبل مدى / كاش؟» |
| `accessibilityOptions` | «مدخل لذوي الاحتياجات» |
| `editorialSummary`، `generativeSummary`، `reviewSummary` | نص توصية حقيقي يدخل مباشرة في prompt الـGroq |
| `fuelOptions`، `evChargeOptions` | أسعار الوقود / شواحن الكهرباء (التغطية ضعيفة بالسعودية — تحقق قبل الإطلاق) |

`IntentService` في
[intent_service.dart](lib/services/intent_service.dart) يحلل أصلاً كلمات الفئات
بالعربي. توسيعه بكلمات المزايا (عائلي، نباتي، يوصّل، جلسة برا، مواقف) خطوة طبيعية
بعدها، وAtmosphere هي البيانات اللي تخلي هذي الفلاتر قابلة للإجابة بدل تجاهلها.

**تحفّظ مهم:** تغطية Atmosphere بالسعودية متفاوتة — كثير من الحقول ترجع null خارج
السلاسل الكبيرة في الرياض وجدة. شغّل دفعة اختبار بـ$0 (تحت الـ1,000 المجانية) على
٣-٤ أحياء بالرياض وقِس نسبة تعبئة كل حقل قبل ما تبني الـprompt عليها. تعامل مع كل
حقل كأنه nullable في الواجهة، بنفس أسلوب التعامل مع `priceLevel` اليوم في
[place_result.dart](lib/models/place_result.dart).

#### A3. فحص وجود مجاني عبر Text Search IDs-Only
**التكلفة: $0، وبلا حد.**

‏Text Search بقناع حقول `places.id` وحده مجاني وبلا سقف. استخدمه كبوابة قبل
الاستدعاء المدفوع في
[search.service.ts:216](server/rico-backend/src/search/search.service.ts#L216):

1. المستخدم يسأل «في ستاربكس قريب؟» ← Text Search مجاني بمعرّفات فقط.
2. صفر نتائج ← جاوب «ما لقيت ستاربكس قريب منك» مجاناً. بلا حرق أي SKU.
3. فيه نتائج ← دوّر معرّفات الأماكن في Mongo. معرّفات الأماكن مسموح تخزينها للأبد
   حسب شروط Google، فهي مفتاح كاش شرعي.
4. وفقط عند عدم وجودها في الكاش تصرف الاستدعاء من فئة الـ$35.

مع توزيع الطلبات المتكررة المتوقع عند ريكو (مطعم / كافيه / صيدلية مرة بعد مرة في
نفس الأحياء) هذا هو الفرق بين الدفع لكل بحث والدفع لكل مكان **جديد**.

#### A4. صور الأماكن في بطاقات الدردشة
**التكلفة: $0 إضافية على البحث؛ و$7/1K لجلب الصورة، منها 1,000 مجانية.**

`places.photos` يقع في مجموعة IDs-Only/Essentials، فإضافته لقناع حقول Enterprise
الحالي عندكم **ما تكلف شي** — أنتم أصلاً محاسَبون على Enterprise. ترجع لك أسماء
موارد الصور مجاناً، وتدفع فقط لما تجلب بيانات الصورة فعلياً.

[place_result_card.dart](lib/widgets/place_result_card.dart) و
[recommended_pick_card.dart](lib/widgets/recommended_pick_card.dart) نصّية بحتة
اليوم. صورة واحدة على الاختيار الموصى به فقط (مو على الـ٨ نتائج كلها) = $0.007
لكل بحث، وأول 1,000 شهرياً مجانية.

> المصادر تختلف قليلاً هل `places.photos` ضمن Essentials أو Pro لطلبات البحث.
> بما إن ريكو محاسَب على Enterprise أصلاً، ما يفرق على فاتورتكم — لكن تأكد
> باستدعاء اختباري قبل ما تفترض إنه مجاني لأي استدعاء **أرخص** تبنيه لاحقاً.

#### A5. الطقس — سياق شبه مجاني للدردشة
**التكلفة: $0.15/1K، و10,000 مجانية شهرياً. والسعودية مدعومة بالكامل.**

أرخص SKU تبيعه Google. مرّر درجة الحرارة الحالية لـprompt التأليف، ويبطل ريكو
يوصّي بجلسة برّا بـ٤٤ درجة في يوليو:

- «الجو ٤٣° الحين — هذا كافيه مكيّف وقريب منك»
- «الجو حلو المغرب، وهذا مكان فيه جلسة برا»

عشرة آلاف استدعاء شهرياً مجاناً، واستدعاء واحد لكل **جلسة** مستخدم (مو لكل بحث)
يخلّيها عملياً بلا حدود. تكلفة تقارب الصفر مقابل مساعد أقرب للبشري بوضوح.

---

### المستوى B — سوّوها لما الحجم يبررها

#### B1. ‏Routes API — وقت قيادة حقيقي بدل المسافة المستقيمة
**التكلفة: $5/1K، و10,000 مجانية. وRoute Matrix يُحاسب لكل عنصر.**

ريكو يعرض مسافة haversine
([search.service.ts:180](server/rico-backend/src/search/search.service.ts#L180))،
ويصيّرها `distanceLabel` كـ«١.٢ كم». وهذي تقلّل تقدير الرحلة الفعلية دائماً —
الطرق السريعة والاتجاه الواحد وزحمة الرياض كلها تكسر الخط المستقيم. «٥ دقائق
بالسيارة» جواب أفضل من «١.٢ كم»، وهي تغيّر **الترتيب** نفسه لا مجرد النص المعروض:
الأقرب جواً غالباً ليس الأسرع وصولاً.

انتبه لنموذج الفوترة: **Route Matrix يُحاسب لكل عنصر** (نقاط البداية × الوجهات).
ثماني نتائج = ٨ عناصر = $0.04 لكل بحث — أغلى من بحث Places نفسه. لذلك:

- احسبها **لأفضل ٣ نتائج فقط** ← ٣ عناصر لكل بحث ← حوالي 3,300 بحث شهرياً داخل
  الـ10,000 المجانية.
- ابقَ على `TRAFFIC_UNAWARE` ‏(Essentials، بـ$5) إلا إذا ثبت عملياً إن مراعاة
  الزحمة تغيّر الجواب. `TRAFFIC_AWARE` تقفز بك لفئة Pro ‏($10/1K، و5,000 مجانية).

#### B2. ‏Geocoding — عنوان البيت وموقع مقروء
**التكلفة: $5/1K، و10,000 مجانية.**

`_resolveOrigin` في
[chat_screen.dart:112](lib/screens/chat_screen.dart#L112) فيه أصلاً مفهوم عنوان
البيت مع عرض للحفظ. الـGeocoding يخليه حقيقياً:

- **للأمام:** «احفظ بيتي: حي النرجس، شارع أنس بن مالك» ← إحداثيات.
- **للخلف:** ‏GPS ← «أنت بحي الياسمين، صح؟» — قابل للتأكيد بدل lat/lng صامت.

العشرة آلاف المجانية شهرياً تغطي هذا بالكامل على حجم ريكو.

#### B3. ‏Autocomplete مع session tokens
**التكلفة: $0 مع session token، إذا تبعه استدعاء Place Details.**

الإكمال التلقائي بالجلسة SKU مجاني — ضغطات المستخدم ما تكلف شي، وتدفع فقط
استدعاء الـDetails اللي يقفل الجلسة. مفيد لإدخال العنوان في مسار الطلب
([requests](server/rico-backend/src/requests/))، ولاقتراح أسماء العلامات
التجارية وهو يكتب في الدردشة. وبدون session token تدفع $2.83/1K (مع 10,000
مجانية)، فاربط الـtoken دائماً.

#### B4. ‏Place Details Enterprise للتفاصيل المعمّقة
**التكلفة: $20/1K، و1,000 مجانية — أرخص من إعادة بحث بـ$35.**

لما المستخدم يقول «الثاني» أو يطلب تفاصيل أكثر، `_resolveReferencedMessage`
([chat_screen.dart:192](lib/screens/chat_screen.dart#L192)) يحلّها من الذاكرة
المحلية — مجاناً وبشكل صحيح. خلّوها كذا. استخدم Place Details فقط لما تحتاج
بيانات **طازجة** لمكان واحد (هل هو مفتوح الحين، مواعيد اليوم). الـ$0.02 للمكان
أرخص من $0.035 لبحث كامل جديد.

---

### المستوى C — للتشغيل، مو للدردشة

#### C1. ‏Places Aggregate — قياس التغطية وتخطيط التوسّع
**التكلفة: $10/1K، و5,000 مجانية.**

ليست ميزة دردشة. تجاوب على «كم مطعم موجود ضمن ٥ كم من هذي النقطة؟» — وهذا يقول
لك كم نسبة الحي اللي تغطيه قاعدة ريكو فعلاً، ووين توجّه جهد المصادر بعدين، وكم
كثافة المنافسة. وتتكامل مباشرة مع تتبّع `search-gap` اللي تسجلونه أصلاً
([search-gap.schema.ts](server/rico-backend/src/public/schemas/search-gap.schema.ts)).

#### C2. ‏Static Maps / Maps SDK
**‏Static Maps بـ$2/1K (و10,000 مجانية)؛ وMaps SDK مجاني بلا حد.**

ريكو حالياً يفتح خرائط جوجل عبر روابط `googleMapsUrl` و`directionsUrl` — مجاني
وبلا مفتاح، وبصراحة كافي. صورة خريطة مصغّرة داخل البطاقة مكسب بصري بسيط مقابل
$0.002. أما **Maps SDK لأندرويد وiOS فمجاني بلا سقف**، يعني عرض خريطة داخل
التطبيق ما يكلف إلا استدعاءات البيانات خلفه — معلومة تستاهل الحفظ لو حبيتم توقفون
تحويل المستخدم لتطبيق الخرائط.

### تجاهلوها

**Air Quality** ‏($5/1K)، **Pollen** ‏(Pro بـ$10/1K)، **Solar** ‏(Enterprise
بـ$75/1K)، **Aerial View** ‏(Pro بـ$16/1K)، **Roads**، **Route Optimization**،
**Navigation SDK** ‏($25/1K). ولا وحدة منها تخدم «دوّر لي على مكان قريب». وSolar
وNavigation تحديداً غاليات وخارج الفكرة تماماً.

---

## ٤. نمذجة التكلفة

تكلفة الاستدعاء فوق الحد المجاني: **$0.035** على Enterprise، و**$0.040** على
Enterprise + Atmosphere. وكل استدعاء يرجع حتى ٢٠ مكاناً وريكو يخزّنها، فتكلفة
**بحث المستخدم** أقل بكثير من تكلفة **استدعاء الـAPI**.

| بحث شهرياً | نسبة إصابة الكاش | استدعاءات Google | المحاسَب (بعد 2,000 مجانية) | Enterprise | ‏+ Atmosphere |
|---|---|---|---|---|---|
| 1,000 | ٥٠٪ | 500 | 0 | **$0** | **$0** |
| 10,000 | ٧٠٪ | 3,000 | 1,000 | **$35** | **$40** |
| 50,000 | ٨٠٪ | 10,000 | 8,000 | **$280** | **$320** |
| 100,000 | ٨٥٪ | 15,000 | 13,000 | **$455** | **$520** |

أضف الطقس (~$0 تحت الـ10 آلاف المجانية)، وRoutes لأفضل ٣ (~$0 تحت الـ10 آلاف
عنصر المجانية عند ≤3,300 بحث؛ وحوالي $100 شهرياً عند 100 ألف بحث)، وصورة على
الاختيار الموصى به فقط (~$0.007 للصورة).

**الخلاصة:** ريكو ما يدفع شي حتى حدود 10,000 بحث شهرياً. وAtmosphere تضيف ١٤٪ —
وعند كل الأحجام في هذا الجدول هذا يعني بين $0 و$65 شهرياً، وهو مبلغ رخيص مقابل
الفرق بين دليل أماكن ومساعد حقيقي.

والرافعة الأهم هي **نسبة إصابة الكاش**، مو اختيار الـSKU. كل نقطة مئوية في نسبة
الإصابة تسوى أكثر من فرق Enterprise/Atmosphere.

---

## ٥. خطران لازم تُقفلان

### الخطر ١ — كاش Mongo على الأغلب يخالف شروط Google للأماكن

`cacheGooglePlaces()`
([search.service.ts:313](server/rico-backend/src/search/search.service.ts#L313))
يكتب `name` و`address` و`phone` و`openingHours` و`priceLevel` و`rating` في
`businesses` كسجلات دائمة موسومة بـ`google_live`، **بلا TTL**.

سياسة Google للأماكن: **معرّفات الأماكن يجوز تخزينها للأبد**؛ أما بقية محتوى
المكان فلا يجوز تخزينه مؤقتاً خارج استثناءات ضيقة (الإحداثيات ~٣٠ يوماً). واسم
العرض والعنوان المنسّق والتقييم والصور ما لها استثناء تخزين. وسجلات ريكو ما تنتهي
صلاحيتها أبداً.

وهذا كمان **خلل في جودة البيانات**، مو مسألة قانونية فقط — المطعم اللي يسكّر يظل
«مفتوح» في قاعدة ريكو للأبد، والتقييم المجمّد على ٤.٦ يظل ٤.٦.

**الحل — تعديل واحد يحل الاثنين:**
- احتفظ بمعرّف مكان Google للأبد كمفتاح ربط (مسموح صراحةً، وهو أصلاً اللي يخزنه
  `sourceLinks`).
- أضف فهرس TTL على السجلات اللي `enrichmentSource: 'google_live'`، بحدود ٣٠ يوم.
- عند انتهاء الصلاحية، أعد الجلب. وفحص المعرّفات المجاني في A3 يخلي إعادة الجلب
  رخيصة.
- الشركاء المنسّقون `source: 'rico'` بياناتكم أنتم ولا يمسّهم التغيير.

يستاهل مراجعة محامٍ قبل التوسّع، مو مراجعتي — لكن الـTTL هو الجواب الهندسي الصحيح
في الحالتين.

### الخطر ٢ — سقف الصرف على مستوى التطبيق فقط

`GOOGLE_PLACES_MONTHLY_CAP` مفروض داخل كود ريكو نفسه
([search.service.ts:216](server/rico-backend/src/search/search.service.ts#L216)).
أي حلقة إعادة محاولة، أو خلل برمجي، أو تسريب للمفتاح يتجاوزه بالكامل ويحاسب
البطاقة مباشرة.

**الحل، من لوحة GCP:**
- قيّد مفتاح الـAPI على Places API فقط، وعلى IP الخادم. هو أصلاً على الخادم فقط
  (تطبيق Flutter ما يحمله إطلاقاً — وهذا صح، و
  [places_service.dart](lib/services/places_service.dart) يوثّق هذا عمداً). مع
  ذلك أقفله.
- اضبط **تنبيه ميزانية** عند السقف الحقيقي اللي تقبلونه.
- اضبط **حدود حصص (quota) يومية لكل SKU** — وهذي هي نقطة التوقف الفعلية. سقف
  التطبيق مجاملة، والحصص هي التنفيذ.

---

## ٦. مفاتيح غير Google موجودة أصلاً في ريكو

للاكتمال، من
[.env.example](server/rico-backend/.env.example):

| المفتاح | يستخدمه | الدور |
|---|---|---|
| `GROQ_API_KEY` | [classify](server/rico-backend/src/classify/)، [compose](server/rico-backend/src/compose/)، [transcribe](server/rico-backend/src/transcribe/) | تصنيف النية، تأليف الرد العربي، تفريغ الصوت عبر Whisper |
| `RESEND_API_KEY` | [mailer](server/rico-backend/src/mailer/) | دعوات التجّار، واستعادة كلمة المرور |
| `GOOGLE_PLACES_API_KEY` | [google-places.adapter.ts](server/rico-backend/src/integrations/google-places.adapter.ts) | كل اللي فوق |

‏Groq هو التكلفة الأخرى لكل استدعاء في مسار الدردشة — استدعاءان لكل رسالة
(تصنيف + تأليف) بالإضافة للتفريغ الصوتي. يستاهل مراجعة تكلفة مستقلة؛ علماً بأن
`gpt-oss-120b` مع `reasoning_effort: 'low'` و`max_tokens: 260` إعداد واعٍ
بالتكلفة أصلاً.

---

## ٧. الترتيب الموصى به للتنفيذ

1. **افصل عدّاد الاستخدام لكل SKU**، وارفع السقوف إلى ~900 لكل واحد. بـ$0،
   وبتسع أضعاف السعة.
2. **أضف TTL لسجلات `google_live`.** يقفل الخطر القانوني وخلل تقادم البيانات معاً.
3. **اضبط حدود الحصص وتنبيه الميزانية في GCP.** حماية صرف حقيقية.
4. **اختبر حقول Atmosphere** تحت الـ1,000 المجانية وقِس نسبة التعبئة بالسعودية.
   إذا كانت النسبة مقبولة، أطلقها — ‏$5/1K مقابل دردشة أفضل نوعياً.
5. **فحص IDs-Only المجاني** قبل الاستدعاء المدفوع. أكبر توفير بنيوي.
6. **الطقس** داخل prompt التأليف. شبه مجاني، وأقرب للبشري بوضوح.
7. **صورة على الاختيار الموصى به.** ‏$0 على البحث، و$0.007 للصورة.
8. **‏Routes لأفضل ٣** لما حجم البحث يبررها.

الخطوات ١-٣ ما تكلف شي ولازم تصير على أي حال. والخطوة ٤ هي اللي تغيّر المنتج.

---

## المصادر

- [تسعير Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing)
- [الاستخدام والفوترة في Places API](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [حقول بيانات الأماكن (New)](https://developers.google.com/maps/documentation/places/web-service/data-fields)
- [تفاصيل الـSKU](https://developers.google.com/maps/billing-and-pricing/sku-details)
- [سياسات Places API والإسناد](https://developers.google.com/maps/documentation/places/web-service/policies)
- [تغييرات التسعير في مارس 2025](https://developers.google.com/maps/billing-and-pricing/march-2025)
- [الاستخدام والفوترة في Routes API](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [تغطية Weather API](https://developers.google.com/maps/documentation/weather/coverage)
- [نظرة عامة على Places Aggregate API](https://developers.google.com/maps/documentation/places-aggregate/overview)
- [‏Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [‏Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
