# LudoSom Android build

The Android application uses Capacitor and keeps the existing web/server deployment as its backend.

## Requirements

- Android Studio with Android SDK 36
- JDK 21
- Node.js and the project dependencies installed

## Debug APK

```powershell
npm.cmd run android:sync
$env:JAVA_HOME='C:\Users\LENOVO\.jdks\jbr-21.0.11'
Set-Location android
.\gradlew.bat assembleDebug
```

The generated APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Android Studio

Run `npm.cmd run android:open`, select a device, and press Run. After any web-code change, run `npm.cmd run android:sync` before rebuilding the Android app.

## Production API

Native builds send relative `/api/...` requests to `VITE_NATIVE_API_BASE_URL`. If it is not set, the app uses `VITE_API_BASE_URL`, then falls back to `https://ludosom.com`.

Example:

```env
VITE_NATIVE_API_BASE_URL=https://ludosom.com
```

The production server must use HTTPS and permit requests from the Capacitor application.

## Release build

Before public distribution:

1. Test login, lobby, deposits/withdrawals, live games, chat, microphone permissions, reconnect, refresh, and Android Back on physical phones.
2. Replace the generated launcher and splash assets with final LudoSom artwork.
3. Create and securely back up a release keystore. Never commit the keystore or its passwords.
4. Configure release signing and build an Android App Bundle (`bundleRelease`) or signed APK.
5. Add `android/app/google-services.json` only when native Firebase services such as FCM are enabled; the file is intentionally ignored by Git.

Real-money staking and cash prizes need a separate distribution/compliance decision. A direct APK can be distributed independently, while Google Play eligibility depends on its current gambling and real-money-games rules, licensing, country availability, and approval.
