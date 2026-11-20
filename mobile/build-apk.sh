#!/usr/bin/env bash
# Local APK build on the owner's PC, without GitHub: bash mobile/build-apk.sh [--install]
# Needs (once): JDK 21 in %LOCALAPPDATA%\Android\jdk-21, Android SDK (platform + build-tools) in %LOCALAPPDATA%\Android,
# the signing key %USERPROFILE%\.zadachnik-android.p12 and its password file .zadachnik-android.pass next to it (never printed).
# The same key as in GitHub, so the APK installs over the released app and keeps the data. --install puts it on the phone via adb.
# Android Gradle refuses project paths with non-ASCII letters on Windows, so the build runs in a copy at $ZBUILD (default E:\zadachnik-build).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
A="${LOCALAPPDATA//\\//}/Android"
export JAVA_HOME="$A/jdk-21" ANDROID_HOME="$A" ANDROID_SDK_ROOT="$A"
export PATH="$JAVA_HOME/bin:$PATH"
KEY="$USERPROFILE/.zadachnik-android.p12"; PASSF="$USERPROFILE/.zadachnik-android.pass"
[ -f "$KEY" ] && [ -f "$PASSF" ] || { echo "no signing key in $USERPROFILE"; exit 1; }

W="${ZBUILD:-/e/zadachnik-build}"
mkdir -p "$W/mobile"
rm -rf "$W/web" "$W/mobile/widget" "$W/mobile/icons"
cp -r "$HERE/../web" "$W/web"
cp -r "$HERE/icons" "$HERE/widget" "$HERE/package.json" "$HERE/capacitor.config.json" "$HERE/prepare-android.sh" "$W/mobile/"
cd "$W/mobile"                                    # node_modules stay here between builds

bash ./prepare-android.sh
(cd android && ./gradlew assembleRelease --no-daemon -q)

BT="$A/build-tools/$(ls "$A/build-tools" | sort -V | tail -1)"
"$BT/zipalign.exe" -f -p 4 android/app/build/outputs/apk/release/app-release-unsigned.apk aligned.apk
KS_PASS="$(tr -d '\r\n' < "$PASSF")" "$BT/apksigner.bat" sign --ks "$KEY" --ks-type PKCS12 --ks-key-alias zadachnik \
  --ks-pass env:KS_PASS --key-pass env:KS_PASS --out Zadachnik.apk aligned.apk
rm -f aligned.apk Zadachnik.apk.idsig
"$BT/apksigner.bat" verify Zadachnik.apk >/dev/null 2>&1 || { echo "signature check failed"; exit 1; }
cp Zadachnik.apk "$HERE/Zadachnik.apk" && echo "built: mobile/Zadachnik.apk ($(du -h "$HERE/Zadachnik.apk" | cut -f1))"

if [ "${1:-}" = "--install" ]; then "$A/platform-tools/adb.exe" install -r "$HERE/Zadachnik.apk"; fi
