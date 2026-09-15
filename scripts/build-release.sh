#!/usr/bin/env bash
#
# بناء نسخة إصدار (Android) بلا فشل GeneratedPluginRegistrant المتكرر.
#
# المشكلة: flutter_native_splash إضافة تطوير (dev_dependency)، وFlutter
# يُدخل إضافات التطوير في بناء debug ويستثنيها من بناء release. الملف
# المولّد android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java
# يُكتب حسب آخر عملية جرت: فإذا كان آخر شي سوّيته بناء debug أو
# `flutter pub get`، يبقى الملف مسجّلاً FlutterNativeSplashPlugin — وهي فئة
# ما هي على مسار الترجمة في release، فينكسر البناء بـ:
#
#   error: package net.jonhanson.flutter_native_splash does not exist
#
# و`flutter clean` ما يحذف الملف، و`flutter pub get` يعيد كتابته بإضافات
# التطوير داخلة. الحل الوحيد الموثوق: احذفه قبل البناء، وبناء release
# يولّده صحيحاً.
#
# الاستخدام:
#   scripts/build-release.sh          # APK
#   scripts/build-release.sh appbundle # AAB لمتجر Google Play
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:-apk}"
case "$TARGET" in
  apk|appbundle) ;;
  *) echo "الهدف غير معروف: $TARGET (المتاح: apk | appbundle)" >&2; exit 2 ;;
esac

# مفاتيح التوقيع تبقى خارج المستودع (android/.gitignore)، فبناء release
# بدونها يوقّع بمفتاح غلط أو يفشل متأخراً — نكتشفها من الآن.
if [ ! -f android/key.properties ]; then
  echo "ناقص android/key.properties — بناء الإصدار يحتاج مفتاح التوقيع." >&2
  exit 1
fi

REGISTRANT=android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java
rm -f "$REGISTRANT"

flutter build "$TARGET" --release "${@:2}"
