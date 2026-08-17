import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const API_ROOT = 'https://api.appstoreconnect.apple.com/v1';
const APP_ID = process.env.APP_STORE_CONNECT_APP_ID ?? '6801921898';
const GROUP_NAME = process.env.APP_STORE_CONNECT_BETA_GROUP ?? 'StoneSiege Internal';
const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID ?? '9XLJZ77PVF';
const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID
  ?? '20f43c69-0c46-4588-b22c-baf6f8fe8a07';
const KEYS_DIR = resolve(process.env.API_PRIVATE_KEYS_DIR ?? '.secrets/appstore');
const POLL_INTERVAL_MS = Number(process.env.APP_STORE_CONNECT_POLL_INTERVAL_MS ?? 15_000);
const POLL_TIMEOUT_MS = Number(process.env.APP_STORE_CONNECT_POLL_TIMEOUT_MS ?? 20 * 60_000);

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

function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: ISSUER_ID,
    iat: now,
    exp: now + 5 * 60,
    aud: 'appstoreconnect-v1',
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('SHA256');
  signer.update(unsigned);
  signer.end();
  const privateKey = readFileSync(resolve(KEYS_DIR, `AuthKey_${KEY_ID}.p8`), 'utf8');
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token()}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`App Store Connect API failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function findBuild(marketingVersion, buildNumber) {
  const query = new URLSearchParams({
    'filter[app]': APP_ID,
    'filter[version]': buildNumber,
    include: 'preReleaseVersion',
    limit: '20',
  });
  const response = await request(`/builds?${query}`);
  const versions = new Map(
    (response.included ?? [])
      .filter((item) => item.type === 'preReleaseVersions')
      .map((item) => [item.id, item.attributes?.version]),
  );
  return (response.data ?? []).find((build) => {
    const preReleaseVersionId = build.relationships?.preReleaseVersion?.data?.id;
    return build.attributes?.version === buildNumber
      && versions.get(preReleaseVersionId) === marketingVersion;
  });
}

async function waitForBuild(marketingVersion, buildNumber) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const build = await findBuild(marketingVersion, buildNumber);
    const state = build?.attributes?.processingState;
    if (state === 'VALID') return build;
    if (state === 'FAILED' || state === 'INVALID') {
      throw new Error(`App Store Connect processed build ${buildNumber} as ${state}.`);
    }
    console.log(`Waiting for iOS ${marketingVersion} (${buildNumber}) to finish processing...`);
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for iOS ${marketingVersion} (${buildNumber}) in App Store Connect.`);
}

async function findAppStoreVersion(marketingVersion) {
  const query = new URLSearchParams({
    'filter[platform]': 'IOS',
    limit: '50',
  });
  const response = await request(`/apps/${APP_ID}/appStoreVersions?${query}`);
  return (response.data ?? []).find(
    (version) => version.attributes?.versionString === marketingVersion,
  );
}

async function attachBuildToVersion(marketingVersion, build) {
  const appStoreVersion = await findAppStoreVersion(marketingVersion);
  if (!appStoreVersion) {
    throw new Error(`Could not find App Store product version ${marketingVersion}.`);
  }
  const linkage = await request(
    `/appStoreVersions/${encodeURIComponent(appStoreVersion.id)}/relationships/build`,
  );
  if (linkage.data?.id === build.id) {
    console.log(`iOS ${marketingVersion} (${build.attributes.version}) is already attached to the App Store version.`);
    return;
  }
  await request(`/appStoreVersions/${encodeURIComponent(appStoreVersion.id)}/relationships/build`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'builds', id: build.id } }),
  });
  console.log(`Attached iOS ${marketingVersion} (${build.attributes.version}) to the App Store version.`);
}

async function findGroup() {
  const query = new URLSearchParams({
    'filter[app]': APP_ID,
    'filter[name]': GROUP_NAME,
    'filter[isInternalGroup]': 'true',
    limit: '20',
  });
  const response = await request(`/betaGroups?${query}`);
  return (response.data ?? []).find((group) => group.attributes?.name === GROUP_NAME);
}

async function groupHasBuild(groupId, buildId) {
  const response = await request(`/betaGroups/${encodeURIComponent(groupId)}/relationships/builds?limit=200`);
  return (response.data ?? []).some((build) => build.id === buildId);
}

const args = parseArgs(process.argv.slice(2));
const marketingVersion = args.get('version');
const buildNumber = args.get('build');
if (!marketingVersion || !buildNumber) {
  throw new Error('Usage: node tools/app-store-connect-release.mjs --version <version> --build <number>');
}

const build = await waitForBuild(marketingVersion, buildNumber);
await attachBuildToVersion(marketingVersion, build);
const group = await findGroup();
if (!group) throw new Error(`Could not find internal TestFlight group "${GROUP_NAME}".`);

if (await groupHasBuild(group.id, build.id)) {
  console.log(`iOS ${marketingVersion} (${buildNumber}) is already in "${GROUP_NAME}".`);
} else {
  await request(`/betaGroups/${encodeURIComponent(group.id)}/relationships/builds`, {
    method: 'POST',
    body: JSON.stringify({ data: [{ type: 'builds', id: build.id }] }),
  });
  console.log(`Added iOS ${marketingVersion} (${buildNumber}) to TestFlight group "${GROUP_NAME}".`);
}
