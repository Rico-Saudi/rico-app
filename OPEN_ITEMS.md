# أعمال مفتوحة

ما تبقّى من تحقيق 2026-11-27، وما أُجّل بقرار. كل بند يقول **ما هو**،
**لماذا أُجّل**، و**ما الذي يلزم** — لأن بنداً بلا سببٍ يُعاد الجدل فيه من الصفر.

البنود الثمانية الأخرى من ذلك التحقيق أُصلحت ودُمجت في PR #14 و#15.

---

## 🔴 ١. عنوان خادم الأردن مبدئي

`RICO_API` في [config/markets/jordan.json](config/markets/jordan.json) مكتوب
`https://app.tadallal.com` — **عنوان لم يُؤكَّد**، كتبته كمبدئي لأن العنوان
الفعلي لم يكن معلوماً وقت الإعداد.

**الخطر:** أول إصدار أردني ينادي خادماً لا وجود له — أو أسوأ، يُصحَّح خطأً
إلى خادم السعودية فيخدم عملاء الأردن ببيانات سعودية وأسعار بالريال.

**اللازم:** سطر واحد — ضع عنوان خادم الأردن الفعلي، ثم:

```bash
flutter test --dart-define-from-file=config/markets/jordan.json
```

**قبل:** أول بناء أردني للنشر.

---

## 🟡 ٢. ملف CI لم يُرفع

ملف `.github/workflows/ci.yml` يشغّل الحزمتين
(`flutter analyze --fatal-infos --fatal-warnings`، `flutter test`،
`npx tsc --noEmit`، `npx jest`) على كل push.

**لماذا تعطّل:** GitHub يرفض إنشاء ملف تحت `.github/workflows/` بتوكن بلا
صلاحية `workflow`. وهي **صلاحية منفصلة** عن صلاحية الدفع: الدفع نجح لستة
فروع، وهذا الملف وحده رُفض.

**محفوظ على:** فرع محلي `add-ci-workflow` (commit واحد، ملف واحد، ٦٧ سطراً).

**اللازم:** إضافة `workflow` للتوكن ثم `git push origin add-ci-workflow`، أو
نسخ الملف ولصقه من واجهة GitHub.

**لماذا يهمّ:** المستودع فيه ٩٥٩ اختباراً (٦٦٦ باكند + ٢٩٣ تطبيق) ولا شيء يشغّلها تلقائياً. هكذا
وصل اختبار `web-offers` الموقوت بالتاريخ إلى فرع إصدار **أحمر** بلا أن
ينبّه أحد.

---

## 🟡 ٣. تقسيم `lib/screens/chat_screen.dart`

الملف **٢٢٥٤** سطراً — أصعب موضع تعديل في المشروع، ويكبر: كان ٢٠٨٨
قبل دمج PR #14/#15.

**الفاصل نظيف ومقيس:** ثمانية محوّلات (`_resolveIntentMessage`،
`_resolveOne`، `_resolveCompareMessage`، `_resolveOrderMessage`،
`_resolveCallMessage`، `_resolveProfessionalMessage`، `_orderFromShownShop`،
`_resolveReferencedMessage`) ومعها مساعداتها = **٨١٣ سطراً**، و**لا تلمس
الحالة إطلاقاً**: صفر `setState`، صفر `mounted`، صفر `context`، صفر
`widget.` — مقيسٌ على `main` بعد الدمج، لا رقمٌ منقول.

**ما يحتاجه:** صنف `ChatMessageResolver` يملك الخدمات، ويأخذ لكل نداء
`mood` و`history` والمحادثة، وبنية `ChatActions` فيها **تسعة ردود أفعال**
(`onOrder`، `onQuickReply`، `onSelectProfessional`،
`onConfirmProfessionalRequest`، `onProfessionalRequestLogin`،
`onCancelProfessionalSelection`، `onAddSuggestion`، `onOrderOffer`،
`pickOrderShop`) لأنها تُغرَس في معالِجات البطاقات المرجَعة.

**لماذا أُجّل:** البند الوحيد من التحقيق الذي **ليس عيباً** — لا خطأ ولا
خطر ولا تكلفة، فقط ملف كبير. و`part` في دارت يقسّم مكتبة لا صنفاً، فالنقل
الصحيح تغييرٌ واسع يستحق مراجعته وحده لا ذيلاً لفرع إصلاحات.

**شبكة الأمان الموجودة:** خمسة اختبارات تشغّل `ChatScreen`
(`confirm_from_chat`، `order_from_shown_list`، `web_offers`,
`distress_gate`، `price_compare`).

---

## 🟡 ٤. ترقية `flutter_secure_storage` تفتح ثلاث ترقيات محبوسة

`flutter_secure_storage: ^9.2.4` يثبّت `win32 ^5`، وهذا يحبس:

| التبعية | محبوسة على | تريد |
|---|---|---|
| `file_picker` | `^8.1.2` | `13.x` (يطلب `win32 ^6`) |
| `geolocator` | `^14.0.2` | `14.1.x` |

**لماذا أُجّل:** الإصدار 11 حذف `AndroidOptions(encryptedSharedPreferences:)`
— التعمية صارت افتراضية لا اختيارية، و`migrateOnAlgorithmChange` افتراضيٌّ
صحيح. لكن هذا مخزن **رمز الدخول** لكل مستخدم مسجَّل: خطأ ترحيل يعني تسجيل
خروج جماعي أو رموزاً مفقودة، ولا يمكن التحقّق منه إلا **على جهاز حقيقي**.
وكان سيصير أثراً جانبياً لحلّ تعارض دمج، لا قراراً.

**اللازم:** ترقية مقصودة + اختبار على جهاز أندرويد فيه حساب مسجَّل مسبقاً
(يُقرأ رمزه القديم بعد الترقية)، ثم رفع `file_picker` و`geolocator` معها.
انظر `test/auth_store_secure_test.dart`.

---

## 🟡 ٥. ترقية Flutter تفتح ترقيتين أخريين

المشروع على **Flutter 3.41.1 (Dart 3.11)**، وعمره ١٠ شهور.

| التبعية | محبوسة على | تريد | تطلب |
|---|---|---|---|
| `cached_network_image` | `^3.4.1` | `4.x` | Dart ≥ 3.12 |
| `record` | `^6.2.1` | `7.x` | Dart ≥ 3.12 |

**لماذا أُجّل:** ترقية Flutter تمسّ سلسلة البناء و`ci.yml` المثبَّت على
`3.41.1` وكود المنصّات المولَّد — قرارٌ مستقلّ لا بند تبعيات.

---

## ⚪ ٦. فروع ميتة لم تُحذف

**مدموجة بالكامل في `main`** (صفر commits أمامها) وقابلة للحذف:

```
clean-version  compare-prices  confirm-order-from-chat  currency-per-market
distress-gate-and-order-from-shown-list  fix-investigation-findings
general-dashboard  owner-teaches-answer  release-1.1.0  security-hardening
vendor-dashboard-all-verticals  vendor-dashboard-every-vertical
vendor-pause-and-notify  web-offers
```

**ومتجمّدة** — فروع أسواق قديمة سبقت أسلوب `market.json`:

| الفرع | ناقصه عن `main` |
|---|---|
| `rico-jo` | **~٥٠٬١٣٥ سطر** |
| `rico-saudi` | **~٢٧٬٩٠٧ سطر** |
| `tadallal-jordan` | ~٣٬٩٢٣ سطر |

هذه الثلاثة **سبب** أسلوب `market.json` الحالي: ميزة تُكتب على فرع سوق تبقى
فيه. لا تُحذف قبل التأكّد أن لا شيء فيها مطلوب.

**لماذا أُجّل:** حذف فرع بعيد يمسّ المستودع المشترك، ويحتاج قرارك.

---

## القاعدة التي يحرسها كل هذا

```
main  ──  كل الميزات وكل الإصلاحات
  ├── rico      = main + market.json   →  السعودية (ريكو، ر.س)
  └── tadallal  = main + market.json   →  الأردن (تدلل، د.أ)
```

فرعا السوقين **لا يحملان ميزة قط**. الفرق بينهما ملف واحد، و`market.json`
غير موجود على `main` فلا يلمسه أي دمج. أي سطر منطق يظهر على أحدهما عيبٌ
يُصلح لا تصميم — انظر [config/markets/README.md](config/markets/README.md).
