import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const PACKAGE_NAME = 'com.stonesiege.app';
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const OAUTH_AUDIENCE = 'https://oauth2.googleapis.com/token';
const API_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD_ROOT = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    args.set(key.slice(2), value);
    index += 1;
  }
  return args;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function serviceAccountToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: OAUTH_SCOPE,
    aud: OAUTH_AUDIENCE,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;

  const response = await fetch(OAUTH_AUDIENCE, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload.access_token;
}

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body && !(options.body instanceof Uint8Array)
        ? { 'content-type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Google Play API failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

const args = parseArgs(process.argv.slice(2));
const bundlePath = resolve(args.get('bundle') ?? 'android/app/build/outputs/bundle/release/app-release.aab');
const track = args.get('track') ?? process.env.GOOGLE_PLAY_TRACK ?? 'internal';
const status = args.get('status') ?? process.env.GOOGLE_PLAY_RELEASE_STATUS ?? 'completed';
const releaseName = args.get('name') ?? 'StoneSiege internal release';
const notes = process.env.MOBILE_RELEASE_NOTES
  ?? 'Upgraded buildings, walls, gates, troops, movement animations, and performance.';
const credentialsPath = resolve(
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? '.secrets/google-play-service-account.json',
);
const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
if (!credentials.client_email || !credentials.private_key) {
  throw new Error(`Invalid Google Play service-account file: ${credentialsPath}`);
}

const token = await serviceAccountToken(credentials);
const edit = await requestJson(
  `${API_ROOT}/applications/${encodeURIComponent(PACKAGE_NAME)}/edits`,
  token,
  { method: 'POST', body: '{}' },
);
const editId = edit.id;
if (!editId) throw new Error('Google Play did not return an edit ID.');

const bundleBytes = new Uint8Array(readFileSync(bundlePath));
const uploaded = await requestJson(
  `${UPLOAD_ROOT}/applications/${encodeURIComponent(PACKAGE_NAME)}/edits/${encodeURIComponent(editId)}/bundles?uploadType=media`,
  token,
  {
    method: 'POST',
    body: bundleBytes,
    headers: { 'content-type': 'application/octet-stream' },
  },
);
const versionCode = String(uploaded.versionCode ?? '');
if (!versionCode) throw new Error('Google Play did not return the uploaded version code.');

await requestJson(
  `${API_ROOT}/applications/${encodeURIComponent(PACKAGE_NAME)}/edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`,
  token,
  {
    method: 'PUT',
    body: JSON.stringify({
      track,
      releases: [{
        name: releaseName,
        status,
        versionCodes: [versionCode],
        releaseNotes: [{ language: 'en-US', text: notes.slice(0, 500) }],
      }],
    }),
  },
);

await requestJson(
  `${API_ROOT}/applications/${encodeURIComponent(PACKAGE_NAME)}/edits/${encodeURIComponent(editId)}:commit`,
  token,
  { method: 'POST', body: '{}' },
);

console.log(`Uploaded Android version code ${versionCode} to Google Play track "${track}".`);
