# StoneSiege mobile packaging

StoneSiege ships the same offline Vite bundle on iOS and Android through Capacitor 8. The official
native application id is the permanent `com.stonesiege.app`. Forks and redistributed builds must
choose a distinct id in `capacitor.config.ts`, Android Gradle, and the Xcode target, as well as a
distinct name and icon under `TRADEMARK.md`.

The wrappers are landscape-only and edge-to-edge. The battlefield canvas remains full-bleed, while
one unscaled DOM container applies the four CSS safe-area insets to the HUD and all in-match
overlays. Keeping that boundary outside the adjustable HUD stage prevents HUD scaling from also
scaling notch or system-gesture clearance. Native pause/background events snapshot the current
match, and Android Back opens the in-game pause state instead of discarding a match. Fonts, game
art, sounds, icons, and splash screens are bundled, so gameplay does not depend on a network
connection.

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

The current build has no accounts, ads, tracking, push notifications, purchases, or third-party
network services beyond analytics. Settings, campaign progress, and resumable-match snapshots
remain in the app's local WebView storage.

Anonymous gameplay statistics are reported through Google Analytics 4 when the build is configured
with `VITE_GA_ID`: app launches, menu screens visited, and match start/resume/end with outcome,
duration, and setup. The configuration is cookieless through Consent Mode
(`analytics_storage: 'denied'`), the client identifier is a random value held in session storage
and discarded when the app closes, and Google Signals and ad personalization are disabled. Players
can turn collection off entirely under
**Settings → Share anonymous gameplay stats**, which prevents the gtag script from loading at all.
The store privacy questionnaires therefore declare app-activity collection for analytics, not
shared and not linked to identity, with no cross-app or cross-site tracking and no ATT prompt.
Reassess every disclosure before release if any further online service or SDK is added.

Before promoting a release:

1. Run `npm test`, `npm run typecheck`, `npm run mobile:sync`, and both native builds.
2. Verify the title screen, a new match, background/resume, Android Back-to-pause, audio after the
   first tap, and save restoration on representative phones and tablets.
3. Confirm icons and splash screens in light and dark appearance, safe-area spacing, and landscape
   orientation in both directions.
4. Check `npm audit --omit=dev`, native dependency reports, store privacy answers, screenshots,
   support/privacy-policy URLs, release notes, and version/build numbers.
5. Keep signing keys, passwords, provisioning data, and store credentials out of Git.

## Automated local releases

The repository includes a local release pipeline. It builds the shared production web bundle,
synchronizes Capacitor, creates signed Android and iOS artifacts, validates both packages, and
uploads them without using either store's manual upload form. The iOS path also waits for App Store
Connect processing and adds the build to the `StoneSiege Internal` TestFlight group.

The one-time local credential setup is:

1. Keep `android/stonesiege-upload.jks` and `android/keystore.properties` in place.
2. Run `npm run release:android:credentials` and enter the upload-key password. It is stored in
   macOS Keychain, not in the repository or shell history.
3. Save the Google Play service-account JSON as
   `.secrets/google-play-service-account.json`. Enable the Google Play Android Developer API for
   its Google Cloud project, then invite the service-account email in Play Console with access to
   StoneSiege and the **Release apps to testing tracks** permission.
4. Save the App Store Connect API private key as
   `.secrets/appstore/AuthKey_9XLJZ77PVF.p8`. The key ID and issuer ID are non-secret project
   defaults and can be overridden with `APP_STORE_CONNECT_KEY_ID` and
   `APP_STORE_CONNECT_ISSUER_ID`.
5. Install the `StoneSiege App Store 2026` provisioning profile and the matching Apple
   Distribution certificate in the login keychain. Override the profile name with
   `IOS_PROVISIONING_PROFILE_SPECIFIER` if it is renewed under another name.

Commands:

```bash
# Run checks, build both signed packages, validate them, and upload Android to
# internal testing plus iOS to App Store Connect/TestFlight.
npm run release:mobile

# Build and validate both packages without uploading.
npm run release:mobile:build

# Upload already-built artifacts.
npm run release:mobile:upload

# Build and upload one platform only.
npm run release:android
npm run release:ios
```

Google Play defaults to the `internal` track. A future public release must opt in explicitly, for
example `GOOGLE_PLAY_TRACK=production npm run release:android`, after the store listing and policy
work is complete. `MOBILE_RELEASE_NOTES` overrides the Android release notes. Set
`MOBILE_RELEASE_SKIP_TESTS=1` only when the exact synchronized commit has already passed the
release checks. iOS defaults to the `StoneSiege Internal` group; override it with
`APP_STORE_CONNECT_BETA_GROUP` when another TestFlight group is desired.
