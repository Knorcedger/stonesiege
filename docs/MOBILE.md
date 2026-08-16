# StoneSiege mobile packaging

StoneSiege ships the same offline Vite bundle on iOS and Android through Capacitor 8. The official
native application id is the permanent `com.stonesiege.app`. Forks and redistributed builds must
choose a distinct id in `capacitor.config.ts`, Android Gradle, and the Xcode target, as well as a
distinct name and icon under `TRADEMARK.md`.

The wrappers are landscape-only and edge-to-edge. CSS safe-area insets protect the HUD around
notches, native pause/background events snapshot the current match, and Android Back opens the
in-game pause state instead of discarding a match. Fonts, game art, sounds, icons, and splash
screens are bundled, so gameplay does not depend on a network connection.

## Rebuild and synchronize

Prerequisites are Node 22.12+ or 24+, Java 21 plus Android SDK 36 for Android, and current Xcode
on macOS for iOS. From the repository root:

```bash
npm ci
npm run mobile:assets  # deterministically rebuild icon and splash PNGs
npm run mobile:sync    # production web build followed by cap sync
```

Run `npm run mobile:android` or `npm run mobile:ios` to synchronize and open the native IDE. Do not
edit the generated `public` or Capacitor JSON files inside the native projects; `cap sync` replaces
them. Platform manifests, project settings, and asset catalogs are source-controlled and may be
edited normally.

## Android

Local debug package:

```bash
cd android
./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. For a release build,
create or obtain the correct upload key outside Git, copy `android/keystore.properties.example`
to `android/keystore.properties`, and set its local filename and alias. Both the properties file
and keystores are ignored by Git. Supply the passwords through
`STONESIEGE_UPLOAD_STORE_PASSWORD` and `STONESIEGE_UPLOAD_KEY_PASSWORD` (or, less safely, as
properties in the ignored file), then build the signed Android App Bundle:

```bash
cd android
STONESIEGE_UPLOAD_STORE_PASSWORD='…' \
STONESIEGE_UPLOAD_KEY_PASSWORD='…' \
  ./gradlew bundleRelease
```

The AAB is written to `android/app/build/outputs/bundle/release/app-release.aab`. Before every
upload, increment `versionCode` in `android/app/build.gradle`; set `versionName` to the public
release version. Google Play App Signing holds the official app-signing key while a protected
upload key signs each AAB.

Authorized maintainers retrieve the official upload key and credentials from the shared
StoneSiege vault in 1Password. They must never be copied into an issue, pull request, chat,
shell history, repository file, or CI log. Other contributors should use their own local key and
must not upload builds under the official application id.

The StoneSiege Play Console app uses `com.stonesiege.app`. Upload each AAB to the internal-testing
track first, add testers, and run the pre-launch report before promoting it. The first upload also
enrols the app in Play App Signing; retain the local upload key and its credentials for every future
Android release.

## iOS

The checked-in project uses Swift Package Manager. Open it after synchronization:

```bash
npm run mobile:ios
```

In Xcode, select the App target, choose the Apple Developer team under Signing & Capabilities, and
confirm the bundle identifier. Set `MARKETING_VERSION` for the public version and increment
`CURRENT_PROJECT_VERSION` for every App Store Connect upload. Test on a physical notched iPhone
and an iPad, then use Product → Archive → Distribute App → App Store Connect.

An unsigned simulator compile can be verified without signing:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/stonesiege-ios-derived \
  CODE_SIGNING_ALLOWED=NO build
```

For the official app, upload to the existing App Store Connect record, confirm the age rating,
privacy, and export-compliance answers for every material feature change, and test install/resume,
audio unlock, rotation lock, and interrupted matches in TestFlight before review submission.
Distribution certificates, provisioning profiles, App Store Connect keys, and recovery material
belong in the shared 1Password vault, never in Git.

## Privacy and release checklist

The current build has no accounts, ads, analytics, tracking, push notifications, purchases, or
third-party network services. Settings, campaign progress, and resumable-match snapshots remain in
the app's local WebView storage. On the current implementation, the store privacy questionnaires
can therefore declare that no user data is collected. Reassess both disclosures before release if
any online service or SDK is added.

Before promoting a release:

1. Run `npm test`, `npm run typecheck`, `npm run mobile:sync`, and both native builds.
2. Verify the title screen, a new match, background/resume, Android Back-to-pause, audio after the
   first tap, and save restoration on representative phones and tablets.
3. Confirm icons and splash screens in light and dark appearance, safe-area spacing, and landscape
   orientation in both directions.
4. Check `npm audit --omit=dev`, native dependency reports, store privacy answers, screenshots,
   support/privacy-policy URLs, release notes, and version/build numbers.
5. Keep signing keys, passwords, provisioning data, and store credentials out of Git.
