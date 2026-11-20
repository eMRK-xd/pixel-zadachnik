#!/usr/bin/env bash
# Generates the Android project (mobile/android) from web/ and puts our pieces in: pixel icon, black window, home-screen widgets.
# Used by both .github/workflows/android.yml and mobile/build-apk.sh, so the CI build and the local build stay the same.
set -euo pipefail
cd "$(dirname "$0")"

npm install --no-audit --no-fund
rm -rf www && cp -r ../web www && rm -f www/sw.js www/_*   # mockups (web/_*) never go into the app
rm -rf android
npx cap add android
npx cap sync android

# pixel icon: adaptive (black background + emblem) and legacy (emblem on black) — no white fill from launchers
RES=android/app/src/main/res
for d in $RES/mipmap-*dpi; do
  cp icons/ic_launcher.png "$d/ic_launcher.png"; cp icons/ic_launcher.png "$d/ic_launcher_round.png"
  cp icons/ic_launcher_foreground.png "$d/ic_launcher_foreground.png"
done
echo '<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#000000</color></resources>' > $RES/values/ic_launcher_background.xml
# black window instead of the white launch screen / system bars
sed -i 's#@drawable/splash#@android:color/black#g' $RES/values/styles.xml
sed -i '/name="AppTheme.NoActionBar"/a <item name="android:windowBackground">@android:color/black</item><item name="android:statusBarColor">@android:color/black</item><item name="android:navigationBarColor">@android:color/black</item>' $RES/values/styles.xml

# home-screen widgets: our MainActivity (registers the Widget plugin), the providers, their layouts, the pixel font, the receivers
APP=android/app/src/main
cp widget/java/*.java $APP/java/com/pixel/zadachnik/
cp -r widget/res/. $RES/
mkdir -p $APP/assets/fonts && cp widget/assets/fonts/* $APP/assets/fonts/
node -e '
const fs=require("fs"),p="android/app/src/main/AndroidManifest.xml";
const m=fs.readFileSync(p,"utf8"),r=fs.readFileSync("widget/manifest-receivers.xml","utf8");
if(!m.includes("</application>")||m.includes(".WidgetA"))throw new Error("unexpected manifest");
fs.writeFileSync(p,m.replace("</application>",r+"    </application>"));'
echo "widget receivers: $(grep -c 'android.appwidget.provider' $APP/AndroidManifest.xml)"
