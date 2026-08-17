import { createHash, createSign } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(readFileSync(join(root, 'store/metadata/en-US.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const APPLE_API = 'https://api.appstoreconnect.apple.com/v1';
const APPLE_APP_ID = process.env.APP_STORE_CONNECT_APP_ID ?? '6801921898';
const APPLE_KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID ?? '9XLJZ77PVF';
const APPLE_ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID
  ?? '20f43c69-0c46-4588-b22c-baf6f8fe8a07';
const APPLE_KEYS_DIR = resolve(process.env.API_PRIVATE_KEYS_DIR ?? join(root, '.secrets/appstore'));
const APPLE_SCREENSHOT_TIMEOUT_MS = Number(
  process.env.APP_STORE_CONNECT_SCREENSHOT_TIMEOUT_MS ?? 5 * 60_000,
);
const GOOGLE_PACKAGE = 'com.stonesiege.app';
const GOOGLE_CREDENTIALS = resolve(
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    ?? join(root, '.secrets/google-play-service-account.json'),
);
const selected = new Set(process.argv.slice(2));
const syncApple = selected.size === 0 || selected.has('--apple');
const syncGoogle = selected.size === 0 || selected.has('--google');

if ([...selected].some((arg) => !['--apple', '--google'].includes(arg))) {
  throw new Error('Usage: node tools/store-metadata-sync.mjs [--apple] [--google]');
}

const pngs = (relativeDir) => readdirSync(join(root, relativeDir))
  .filter((name) => name.endsWith('.png'))
  .sort()
  .map((name) => join(root, relativeDir, name));
const storeImages = (relativeDir) => readdirSync(join(root, relativeDir))
  .filter((name) => /\.(png|jpe?g)$/i.test(name))
  .sort()
  .map((name) => join(root, relativeDir, name));

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

async function jsonResponse(response, label) {
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { text }; }
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

async function appleRequest(path, options = {}) {
  return jsonResponse(await fetch(`${APPLE_API}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${appleToken()}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  }), `App Store Connect ${options.method ?? 'GET'} ${path}`);
}

async function uploadAppleScreenshot(setId, file) {
  const bytes = readFileSync(file);
  const reservation = await appleRequest('/appScreenshots', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'appScreenshots',
        attributes: { fileSize: bytes.length, fileName: basename(file) },
        relationships: {
          appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } },
        },
      },
    }),
  });
  for (const operation of reservation.data.attributes.uploadOperations ?? []) {
    const response = await fetch(operation.url, {
      method: operation.method,
      headers: Object.fromEntries((operation.requestHeaders ?? []).map((item) => [item.name, item.value])),
      body: bytes.subarray(operation.offset, operation.offset + operation.length),
    });
    if (!response.ok) throw new Error(`Apple screenshot upload failed (${response.status}) for ${basename(file)}`);
  }
  const id = reservation.data.id;
  await appleRequest(`/appScreenshots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'appScreenshots', id,
        attributes: {
          uploaded: true,
          sourceFileChecksum: createHash('md5').update(bytes).digest('hex'),
        },
      },
    }),
  });
  return id;
}

const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function waitForAppleScreenshot(id) {
  const deadline = Date.now() + APPLE_SCREENSHOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const screenshot = await appleRequest(`/appScreenshots/${id}`);
    const state = screenshot.data.attributes.assetDeliveryState?.state;
    if (state === 'COMPLETE') return;
    if (state === 'FAILED') {
      throw new Error(`Apple rejected screenshot ${screenshot.data.attributes.fileName}: ${JSON.stringify(screenshot.data.attributes.assetDeliveryState?.errors ?? [])}`);
    }
    await wait(2_000);
  }
  throw new Error(`Timed out waiting for Apple screenshot ${id}`);
}

async function replaceAppleScreenshotSet(localizationId, displayType, files) {
  const current = await appleRequest(
    `/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=50`,
  );
  const matching = (current.data ?? []).filter(
    (set) => set.attributes.screenshotDisplayType === displayType,
  );
  const expectedNames = files.map((file) => basename(file)).sort();
  for (const set of matching) {
    const screenshots = await appleRequest(`/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
    const currentNames = (screenshots.data ?? [])
      .filter((shot) => shot.attributes.assetDeliveryState?.state === 'COMPLETE')
      .map((shot) => shot.attributes.fileName)
      .sort();
    if (currentNames.length === expectedNames.length
      && currentNames.every((name, index) => name === expectedNames[index])) {
      console.log(`App Store Connect: ${displayType} screenshots are already current.`);
      return;
    }
  }
  for (const set of matching) await appleRequest(`/appScreenshotSets/${set.id}`, { method: 'DELETE' });
  const created = await appleRequest('/appScreenshotSets', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'appScreenshotSets',
        attributes: { screenshotDisplayType: displayType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: 'appStoreVersionLocalizations', id: localizationId },
          },
        },
      },
    }),
  });
  const screenshotIds = [];
  for (const file of files) screenshotIds.push(await uploadAppleScreenshot(created.data.id, file));
  await Promise.all(screenshotIds.map(waitForAppleScreenshot));
  console.log(`App Store Connect: uploaded ${files.length} ${displayType} screenshots.`);
}

async function syncAppleMetadata() {
  if (!existsSync(join(APPLE_KEYS_DIR, `AuthKey_${APPLE_KEY_ID}.p8`))) {
    throw new Error('App Store Connect API key is missing.');
  }
  await appleRequest(`/apps/${APPLE_APP_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'apps',
        id: APPLE_APP_ID,
        attributes: { contentRightsDeclaration: metadata.contentRightsDeclaration },
      },
    }),
  });
  const versions = await appleRequest(`/apps/${APPLE_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=50`);
  let appVersion = (versions.data ?? []).find((item) => item.attributes.versionString === version);
  if (!appVersion) {
    const editableStates = new Set([
      'PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'INVALID_BINARY',
      'REJECTED', 'METADATA_REJECTED', 'DEVELOPER_REJECTED',
    ]);
    const editable = (versions.data ?? []).find((item) => (
      editableStates.has(item.attributes.appStoreState)
    ));
    if (editable) {
      const previousVersion = editable.attributes.versionString;
      appVersion = (await appleRequest(`/appStoreVersions/${editable.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          data: {
            type: 'appStoreVersions', id: editable.id,
            attributes: { versionString: version },
          },
        }),
      })).data;
      console.log(`App Store Connect: renamed editable version ${previousVersion} to ${version}.`);
    } else {
      const created = await appleRequest('/appStoreVersions', {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'appStoreVersions',
            attributes: { platform: 'IOS', versionString: version },
            relationships: { app: { data: { type: 'apps', id: APPLE_APP_ID } } },
          },
        }),
      });
      appVersion = created.data;
    }
  }
  await appleRequest(`/appStoreVersions/${appVersion.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: { type: 'appStoreVersions', id: appVersion.id, attributes: { copyright: metadata.copyright } },
    }),
  });
  try {
    const review = await appleRequest(`/appStoreVersions/${appVersion.id}/appStoreReviewDetail`);
    await appleRequest(`/appStoreReviewDetails/${review.data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'appStoreReviewDetails',
          id: review.data.id,
          attributes: { demoAccountRequired: false, notes: metadata.reviewNotes },
        },
      }),
    });
  } catch (error) {
    if (!error.message.includes('failed (404)')) throw error;
    console.warn('App Store Connect: reviewer contact record is not created yet; review notes were not synced.');
  }

  const localizations = await appleRequest(
    `/appStoreVersions/${appVersion.id}/appStoreVersionLocalizations?limit=50`,
  );
  let english = (localizations.data ?? []).find((item) => item.attributes.locale === 'en-US');
  const versionAttributes = {
    description: metadata.description,
    keywords: metadata.keywords,
    marketingUrl: metadata.marketingUrl,
    promotionalText: metadata.promotionalText,
    supportUrl: metadata.supportUrl,
  };
  if (english) {
    english = (await appleRequest(`/appStoreVersionLocalizations/${english.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'appStoreVersionLocalizations', id: english.id, attributes: versionAttributes },
      }),
    })).data;
  } else {
    english = (await appleRequest('/appStoreVersionLocalizations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: { locale: 'en-US', ...versionAttributes },
          relationships: {
            appStoreVersion: { data: { type: 'appStoreVersions', id: appVersion.id } },
          },
        },
      }),
    })).data;
  }

  const infos = await appleRequest(`/apps/${APPLE_APP_ID}/appInfos?limit=50`);
  let infoLocalizationUpdated = false;
  for (const info of infos.data ?? []) {
    const declaration = await appleRequest(`/appInfos/${info.id}/ageRatingDeclaration`);
    await appleRequest(`/ageRatingDeclarations/${declaration.data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'ageRatingDeclarations',
          id: declaration.data.id,
          attributes: metadata.appleAgeRatingDeclarations,
        },
      }),
    });
    const infoLocalizations = await appleRequest(`/appInfos/${info.id}/appInfoLocalizations?limit=50`);
    const infoEnglish = (infoLocalizations.data ?? []).find((item) => item.attributes.locale === 'en-US');
    if (!infoEnglish) continue;
    await appleRequest(`/appInfoLocalizations/${infoEnglish.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'appInfoLocalizations', id: infoEnglish.id,
          attributes: { subtitle: metadata.subtitle, privacyPolicyUrl: metadata.privacyPolicyUrl },
        },
      }),
    });
    infoLocalizationUpdated = true;
  }
  if (!infoLocalizationUpdated) throw new Error('No en-US App Store app-info localization exists.');

  await replaceAppleScreenshotSet(
    english.id, 'APP_IPHONE_67', pngs('store/screenshots/ios/iphone-6.9'),
  );
  await replaceAppleScreenshotSet(
    english.id, 'APP_IPAD_PRO_3GEN_129', pngs('store/screenshots/ios/ipad-13'),
  );
  console.log(`App Store Connect: synced StoneSiege ${version} metadata, content rights, age rating, and privacy URL.`);
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
  const tokenResponse = await jsonResponse(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion,
    }),
  }), 'Google OAuth');
  return tokenResponse.access_token;
}

async function syncGoogleMetadata() {
  if (!existsSync(GOOGLE_CREDENTIALS)) throw new Error('Google Play credentials are missing.');
  const token = await googleToken();
  const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE}`;
  const uploadApi = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${GOOGLE_PACKAGE}`;
  const request = async (url, options = {}) => jsonResponse(await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body && typeof options.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  }), `Google Play ${options.method ?? 'GET'} ${url}`);
  const edit = await request(`${api}/edits`, { method: 'POST', body: '{}' });
  const base = `${api}/edits/${edit.id}`;
  try {
    await request(`${base}/listings/en-US`, {
      method: 'PUT',
      body: JSON.stringify({
        language: 'en-US',
        title: metadata.name,
        shortDescription: metadata.shortDescription,
        fullDescription: metadata.description,
      }),
    });
    const imageSets = [
      ['phoneScreenshots', pngs('store/screenshots/android/phone')],
      ['sevenInchScreenshots', storeImages('store/screenshots/android/tablet')],
      ['tenInchScreenshots', storeImages('store/screenshots/android/tablet')],
    ];
    for (const [imageType, files] of imageSets) {
      await request(`${base}/listings/en-US/${imageType}`, { method: 'DELETE' });
      for (const file of files) {
        await request(
          `${uploadApi}/edits/${edit.id}/listings/en-US/${imageType}?uploadType=media`,
          {
            method: 'POST', body: readFileSync(file),
            headers: { 'content-type': file.endsWith('.png') ? 'image/png' : 'image/jpeg' },
          },
        );
      }
      console.log(`Google Play: uploaded ${files.length} ${imageType}.`);
    }
    await request(`${base}:commit`, { method: 'POST', body: '{}' });
    console.log('Google Play: synced en-US listing and current screenshots.');
  } catch (error) {
    try { await request(base, { method: 'DELETE' }); } catch { /* edit expires harmlessly */ }
    throw error;
  }
}

if (syncApple) await syncAppleMetadata();
if (syncGoogle) await syncGoogleMetadata();
