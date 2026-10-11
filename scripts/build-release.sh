#!/usr/bin/env bash
#
# بناء نسخة إصدار (Android) موقّعة.
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

flutter build "$TARGET" --release "${@:2}"

# بلا GeneratedPluginRegistrant لا تُسجَّل أي إضافة، والتطبيق يعلق على شاشة
# البداية (SharedPreferences ترمي MissingPluginException) — حصل في نسخة
# 1.0.1+2 المرفوعة. نرفض الناتج قبل أن يصل المتجر.
REGISTRANT=android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java
if ! grep -q 'SharedPreferencesPlugin' "$REGISTRANT" 2>/dev/null; then
  echo "الناتج بلا إضافات مسجّلة ($REGISTRANT) — لا ترفعه." >&2
  exit 1
fi
