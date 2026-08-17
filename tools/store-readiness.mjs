import { spawnSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localOnly = process.argv.includes('--local-only');
const blockers = [];
const warnings = [];
const passes = [];

const APPLE_APP_ID = process.env.APP_STORE_CONNECT_APP_ID ?? '6801921898';
const APPLE_KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID ?? '9XLJZ77PVF';
const APPLE_ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID
  ?? '20f43c69-0c46-4588-b22c-baf6f8fe8a07';
const APPLE_KEYS_DIR = resolve(process.env.API_PRIVATE_KEYS_DIR ?? join(root, '.secrets/appstore'));
const GOOGLE_CREDENTIALS = resolve(
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    ?? join(root, '.secrets/google-play-service-account.json'),
);
const PACKAGE_NAME = 'com.stonesiege.app';

const read = (path) => readFileSync(join(root, path), 'utf8');
const requireCheck = (condition, message) => {
  if (condition) passes.push(message);
  else blockers.push(message);
};

function dimensions(path) {
  const bytes = readFileSync(path);
  if (bytes.length >= 24 && bytes.subarray(1, 4).toString() === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const size = bytes.readUInt16BE(offset + 2);
      if (size < 2) break;
      offset += size + 2;
    }
  }
  throw new Error(`Unsupported image format: ${path}`);
}

function imagesIn(relativeDir) {
  const dir = join(root, relativeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => ['.png', '.jpg', '.jpeg'].includes(extname(name).toLowerCase()))
    .sort()
    .map((name) => join(dir, name));
}

function checkScreenshotSet(relativeDir, acceptedSizes, label) {
  const images = imagesIn(relativeDir);
  requireCheck(images.length >= 4, `${label}: at least four screenshots`);
  for (const image of images) {
    const size = dimensions(image);
    requireCheck(
      acceptedSizes.some(([width, height]) => width === size.width && height === size.height),
      `${label}: ${image.slice(root.length + 1)} has an accepted size`,
    );
  }
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function checkUrl(url, label) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    requireCheck(response.ok && response.url.startsWith('https://'), `${label}: ${url} is live over HTTPS`);
  } catch (error) {
    blockers.push(`${label}: ${url} could not be reached (${error.message})`);
  }
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function appleToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: APPLE_KEY_ID, typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: APPLE_ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1',
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('SHA256');
  signer.update(unsigned);
  signer.end();
  const key = readFileSync(join(APPLE_KEYS_DIR, `AuthKey_${APPLE_KEY_ID}.p8`), 'utf8');
  return `${unsigned}.${signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function appleRequest(path) {
  return jsonRequest(`https://api.appstoreconnect.apple.com/v1${path}`, {
    headers: { authorization: `Bearer ${appleToken()}` },
  });
}

async function appleAudit(version, buildNumber) {
  if (!existsSync(join(APPLE_KEYS_DIR, `AuthKey_${APPLE_KEY_ID}.p8`))) {
    blockers.push('App Store Connect API key is installed');
    return;
  }
  try {
    const app = await appleRequest(`/apps/${APPLE_APP_ID}`);
    requireCheck(app.data?.attributes?.bundleId === PACKAGE_NAME, 'App Store Connect bundle id matches');

    const versions = await appleRequest(
      `/apps/${APPLE_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=50`,
    );
    const current = versions.data?.find((item) => item.attributes?.versionString === version);
    if (!current) {
      warnings.push(`App Store Connect has no editable ${version} product version yet`);
    } else {
      passes.push(`App Store Connect has iOS product version ${version} (${current.attributes.appStoreState})`);
      const localizations = await appleRequest(
        `/appStoreVersions/${current.id}/appStoreVersionLocalizations?limit=50`,
      );
      const english = localizations.data?.find((item) => item.attributes?.locale === 'en-US');
      requireCheck(Boolean(english?.attributes?.description), 'App Store en-US description is populated');
      requireCheck(Boolean(english?.attributes?.supportUrl), 'App Store support URL is populated');
      if (english) {
        const sets = await appleRequest(
          `/appStoreVersionLocalizations/${english.id}/appScreenshotSets?limit=50`,
        );
        // App Store Connect retains APP_IPHONE_67 as the API identifier for the
        // largest iPhone screenshot set, including current 6.9-inch devices.
        const required = new Set(['APP_IPHONE_67', 'APP_IPAD_PRO_3GEN_129']);
        for (const set of sets.data ?? []) {
          const shots = await appleRequest(`/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
          const processed = (shots.data ?? []).filter(
            (shot) => shot.attributes?.assetDeliveryState?.state === 'COMPLETE',
          );
          if (processed.length >= 4) required.delete(set.attributes?.screenshotDisplayType);
        }
        requireCheck(required.size === 0, 'App Store has four processed iPhone 6.9-inch and four processed iPad 13-inch screenshots');
      }
      const linkage = await appleRequest(
        `/appStoreVersions/${current.id}/relationships/build`,
      );
      requireCheck(Boolean(linkage.data?.id), 'App Store product version has a build attached');
      if (linkage.data?.id) {
        const attachedBuild = await appleRequest(`/builds/${linkage.data.id}`);
        requireCheck(
          attachedBuild.data?.attributes?.version === buildNumber
            && attachedBuild.data?.attributes?.processingState === 'VALID',
          `App Store product version uses valid build ${buildNumber}`,
        );
      }
    }

    const infos = await appleRequest(`/apps/${APPLE_APP_ID}/appInfos?limit=20`);
    const info = infos.data?.[0];
    if (info) {
      const declaration = await appleRequest(`/appInfos/${info.id}/ageRatingDeclaration`);
      const expected = Object.entries(metadata.appleAgeRatingDeclarations);
      requireCheck(
        expected.every(([key, value]) => declaration.data?.attributes?.[key] === value),
        'App Store age-rating declaration matches the repository source of truth',
      );
      const localizations = await appleRequest(`/appInfos/${info.id}/appInfoLocalizations?limit=50`);
      const english = localizations.data?.find((item) => item.attributes?.locale === 'en-US');
      requireCheck(Boolean(english?.attributes?.privacyPolicyUrl), 'App Store privacy-policy URL is populated');
    } else blockers.push('App Store app information exists');

    const builds = await appleRequest(`/builds?filter[app]=${APPLE_APP_ID}&limit=50`);
    const validBuilds = (builds.data ?? []).filter((item) => item.attributes?.processingState === 'VALID');
    requireCheck(validBuilds.length > 0, 'App Store Connect has at least one valid processed build');
  } catch (error) {
    blockers.push(`App Store Connect audit completed (${error.message})`);
  }
}

async function googleToken() {
  const credentials = JSON.parse(readFileSync(GOOGLE_CREDENTIALS, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
  const response = await jsonRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  return response.access_token;
}

async function googleAudit() {
  if (!existsSync(GOOGLE_CREDENTIALS)) {
    blockers.push('Google Play service-account credentials are installed');
    return;
  }
  const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`;
  let editId;
  let accessToken;
  const request = async (path, options = {}) => jsonRequest(`${api}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  try {
    accessToken = await googleToken();
    const edit = await request('/edits', { method: 'POST', body: '{}' });
    editId = edit.id;
    const base = `/edits/${editId}`;
    const [listings, tracks] = await Promise.all([
      request(`${base}/listings`), request(`${base}/tracks`),
    ]);
    const english = listings.listings?.find((item) => item.language === 'en-US');
    requireCheck(Boolean(english?.title), 'Google Play en-US title is populated');
    requireCheck(Boolean(english?.shortDescription), 'Google Play short description is populated');
    requireCheck(Boolean(english?.fullDescription), 'Google Play full description is populated');
    requireCheck((tracks.tracks ?? []).some((track) => (
      ['internal', 'production'].includes(track.track) && (track.releases?.length ?? 0) > 0
    )), 'Google Play has an internal or production release');

    const imageTypes = ['phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots', 'featureGraphic', 'icon'];
    for (const imageType of imageTypes) {
      const images = await request(`${base}/listings/en-US/${imageType}`);
      const minimum = imageType.endsWith('Screenshots') ? 4 : 1;
      requireCheck((images.images?.length ?? 0) >= minimum, `Google Play has ${minimum} ${imageType}`);
    }
  } catch (error) {
    blockers.push(`Google Play audit completed (${error.message})`);
  } finally {
    if (editId && accessToken) {
      try { await request(`/edits/${editId}`, { method: 'DELETE' }); } catch { /* expires harmlessly */ }
    }
  }
}

const packageJson = JSON.parse(read('package.json'));
const metadata = JSON.parse(read('store/metadata/en-US.json'));
const androidGradle = read('android/app/build.gradle');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const androidVariables = read('android/variables.gradle');
const xcodeProject = read('ios/App/App.xcodeproj/project.pbxproj');
const privacyManifest = read('ios/App/App/PrivacyInfo.xcprivacy');

const androidVersion = androidGradle.match(/versionName\s+"([^"]+)"/)?.[1];
const androidCode = Number(androidGradle.match(/versionCode\s+(\d+)/)?.[1]);
const iosVersion = xcodeProject.match(/MARKETING_VERSION = ([^;]+);/)?.[1];
const iosBuild = Number(xcodeProject.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1]);

requireCheck(androidVersion === packageJson.version, 'Android version matches package.json');
requireCheck(iosVersion === packageJson.version, 'iOS version matches package.json');
requireCheck(androidCode >= 6, 'Android version code is at least 6');
requireCheck(iosBuild >= 5, 'iOS build number is at least 5');
requireCheck(/targetSdkVersion = 36/.test(androidVariables), 'Android targets API 36');
requireCheck(/android:allowBackup="false"/.test(androidManifest), 'Android cloud backup is disabled');
requireCheck(/android:usesCleartextTraffic="false"/.test(androidManifest), 'Android cleartext traffic is disabled');
requireCheck(!/android\.permission\.(CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION|READ_CONTACTS)/.test(androidManifest), 'Android requests no sensitive permissions');
requireCheck(/NSPrivacyTracking<\/key>\s*<false\/>/.test(privacyManifest), 'iOS privacy manifest declares no tracking');
requireCheck(/PrivacyInfo\.xcprivacy in Resources/.test(xcodeProject), 'iOS privacy manifest belongs to the app target');
requireCheck(/ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(read('ios/App/App/Info.plist')), 'iOS export-compliance declaration is present');
requireCheck(commandOutput('xcodebuild', ['-version']).startsWith('Xcode 26'), 'Xcode 26 is selected');
requireCheck(commandOutput('xcodebuild', ['-showsdks']).includes('iphoneos26'), 'iOS 26 SDK is installed');
requireCheck(metadata.subtitle.length <= 30, 'Apple subtitle is at most 30 characters');
requireCheck(metadata.keywords.length <= 100, 'Apple keywords are at most 100 characters');
requireCheck(metadata.promotionalText.length <= 170, 'Apple promotional text is at most 170 characters');
requireCheck(metadata.shortDescription.length <= 80, 'Google short description is at most 80 characters');
requireCheck(metadata.description.length <= 4000, 'Store description is at most 4,000 characters');
requireCheck(metadata.privacy.dataCollected === false && metadata.privacy.tracking === false, 'Store privacy source declares no collection or tracking');

checkScreenshotSet('store/screenshots/ios/iphone-6.9', [[2796, 1290], [2736, 1260], [2868, 1320]], 'iPhone 6.9-inch');
checkScreenshotSet('store/screenshots/ios/ipad-13', [[2752, 2064], [2732, 2048]], 'iPad 13-inch');
checkScreenshotSet('store/screenshots/android/phone', [[1920, 1080], [2796, 1290], [2736, 1260], [2868, 1320]], 'Google Play phone');
checkScreenshotSet('store/screenshots/android/tablet', [[2752, 2064], [2732, 2048]], 'Google Play tablet');
for (const image of imagesIn('store/screenshots/android/tablet')) {
  requireCheck(readFileSync(image).length <= 8_000_000, `Google Play tablet: ${image.slice(root.length + 1)} is no larger than 8 MB`);
}
requireCheck(dimensions(join(root, 'art/play-store-icon.png')).width === 512, 'Google Play icon is 512 pixels wide');
const featureSize = dimensions(join(root, 'art/store/feature-graphic.jpg'));
requireCheck(featureSize.width === 1024 && featureSize.height === 500, 'Google Play feature graphic is 1024x500');

await Promise.all([
  checkUrl(metadata.privacyPolicyUrl, 'Privacy policy'),
  checkUrl(metadata.supportUrl, 'Support URL'),
]);

if (!localOnly) {
  await appleAudit(packageJson.version, String(iosBuild));
  await googleAudit();
}

console.log(`\nStore readiness: ${passes.length} passed, ${warnings.length} warnings, ${blockers.length} blockers.`);
for (const item of warnings) console.log(`WARN  ${item}`);
for (const item of blockers) console.log(`BLOCK ${item}`);
if (blockers.length > 0) process.exitCode = 1;
