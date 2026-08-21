# Store submission source of truth

StoneSiege's public store copy and disclosure answers live in `metadata/en-US.json`. Keep this file,
the app behavior, `https://stonesiegegame.com/privacy`, and both store-console questionnaires in
agreement. The game targets players aged 13 and over and must not be placed in Apple's Kids category
or Google Play's Designed for Families program.

## Required console declarations

- Category: Games / Strategy; free; no in-app purchases.
- App access: unrestricted; reviewers need no account or instructions beyond `reviewNotes`.
- Ads, tracking, accounts, purchases, loot boxes, gambling, user-generated content, social
  features, location, camera, microphone, contacts, health, and financial features: none.
- Analytics: anonymous, cookieless gameplay statistics only (Google Analytics 4), optional through
  the in-game **Share anonymous gameplay stats** setting. No cookies, no advertising identifier, no
  persistent identifier, and no cross-app or cross-site tracking, so no App Tracking Transparency
  prompt applies. Google acts as a processor; nothing is shared for a third party's own purposes.
- Privacy/Data Safety: **App activity / App interactions** is collected for analytics, not shared,
  not linked to identity, and optional. Apple's equivalent answer is **Usage Data / Product
  Interaction**, used for Analytics, not linked to identity, not used for tracking. Everything else
  — settings, campaign progress, and saved matches — stays local. Android backup is disabled so
  those records are not uploaded by Auto Backup. Keep this answer, `metadata/en-US.json`,
  `ios/App/App/PrivacyInfo.xcprivacy`, and `https://stonesiegegame.com/privacy` in agreement.
- Content: frequent small-scale stylized medieval combat without blood or gore; historical text
  mentions death, execution, and captivity. Use 13+ as the intended minimum audience and answer
  Apple/IARC questionnaires conservatively from those facts.
- Export compliance: the app uses only operating-system encryption and sets
  `ITSAppUsesNonExemptEncryption` to `false`.

## Submission gates

1. `npm run store:check` must pass, including version, policy URL, icon, screenshot, manifest,
   signing, and platform checks.
2. `npm test`, `npm run typecheck`, `npm audit --omit=dev`, and both signed release builds pass.
3. Test the signed build on at least one current phone and one tablet per platform: first launch,
   audio after first interaction, both landscape orientations, safe areas, new campaign, practice
   match, pause/resume, background/foreground, local save/restore, and Android Back.
4. Run Google Play's pre-launch report and distribute the exact candidate through internal testing
   and TestFlight before promoting it to production review.
5. Recheck the App Store age-rating questionnaire introduced in 2026 and every Play Console item
   under App content immediately before submission.

For the first iOS release, keep the `APP_IPHONE_65` and `APP_IPAD_PRO_3GEN_129` screenshot sets
populated. App Store Connect's submission validator requires these legacy display slots even when
newer 6.9-inch iPhone and 13-inch iPad screenshots are also available.
