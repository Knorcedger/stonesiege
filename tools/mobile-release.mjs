import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'all';
const validModes = new Set(['all', 'build', 'upload', 'android', 'ios']);
if (!validModes.has(mode)) {
  throw new Error(`Unknown release mode "${mode}". Use: ${[...validModes].join(', ')}`);
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const androidGradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const androidVersionCode = androidGradle.match(/versionCode\s+(\d+)/)?.[1];
const androidVersionName = androidGradle.match(/versionName\s+"([^"]+)"/)?.[1];
const xcodeProject = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
const iosBuild = xcodeProject.match(/CURRENT_PROJECT_VERSION = ([^;]+);/)?.[1];
const iosVersion = xcodeProject.match(/MARKETING_VERSION = ([^;]+);/)?.[1];

const androidBundle = join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
const iosArchive = join(root, 'ios/build/StoneSiege.xcarchive');
const iosExport = join(root, 'ios/build/export');
const appleKeyId = process.env.APP_STORE_CONNECT_KEY_ID ?? '9XLJZ77PVF';
const appleIssuerId = process.env.APP_STORE_CONNECT_ISSUER_ID
  ?? '20f43c69-0c46-4588-b22c-baf6f8fe8a07';
const appleKeysDir = resolve(
  process.env.API_PRIVATE_KEYS_DIR ?? join(root, '.secrets/appstore'),
);
const googleCredentials = resolve(
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    ?? join(root, '.secrets/google-play-service-account.json'),
);

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function keychainPassword(service) {
  const result = spawnSync(
    '/usr/bin/security',
    ['find-generic-password', '-a', 'stonesiege', '-s', service, '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return result.status === 0 ? result.stdout.trim() : '';
}

function requireFile(path, description) {
  if (!existsSync(path)) throw new Error(`${description} is missing: ${path}`);
}

function assertVersions() {
  if (!androidVersionCode || !iosBuild) throw new Error('Could not read native build numbers.');
  if (androidVersionName !== version || iosVersion !== version) {
    throw new Error(
      `Version mismatch: package=${version}, Android=${androidVersionName}, iOS=${iosVersion}`,
    );
  }
  console.log(`Releasing StoneSiege ${version} (Android ${androidVersionCode}, iOS ${iosBuild}).`);
}

function checksAndSync() {
  if (process.env.MOBILE_RELEASE_SKIP_TESTS !== '1') {
    run('npm', ['test']);
    run('npm', ['run', 'typecheck']);
    run('npm', ['audit', '--omit=dev']);
  }
  run('npm', ['run', 'mobile:sync']);
}

function buildAndroid() {
  const storePassword = process.env.STONESIEGE_UPLOAD_STORE_PASSWORD
    || keychainPassword('com.stonesiege.android.store');
  const keyPassword = process.env.STONESIEGE_UPLOAD_KEY_PASSWORD
    || keychainPassword('com.stonesiege.android.key');
  if (!storePassword || !keyPassword) {
    throw new Error('Android signing password is missing. Run: npm run release:android:credentials');
  }
  run('./gradlew', ['bundleRelease'], {
    cwd: join(root, 'android'),
    env: {
      STONESIEGE_UPLOAD_STORE_PASSWORD: storePassword,
      STONESIEGE_UPLOAD_KEY_PASSWORD: keyPassword,
    },
  });
  requireFile(androidBundle, 'Signed Android App Bundle');
  run('jarsigner', ['-verify', androidBundle]);
}

function buildIos() {
  const profileName = process.env.IOS_PROVISIONING_PROFILE_SPECIFIER
    ?? 'StoneSiege App Store 2026';
  rmSync(iosArchive, { recursive: true, force: true });
  rmSync(iosExport, { recursive: true, force: true });
  mkdirSync(join(root, 'ios/build'), { recursive: true });
  run('xcodebuild', [
    '-project', 'ios/App/App.xcodeproj',
    '-scheme', 'App',
    '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    '-archivePath', iosArchive,
    'CODE_SIGN_STYLE=Manual',
    'CODE_SIGN_IDENTITY=Apple Distribution',
    'DEVELOPMENT_TEAM=CLXL3KB9RR',
    `PROVISIONING_PROFILE_SPECIFIER=${profileName}`,
    'archive',
  ]);
  run('xcodebuild', [
    '-exportArchive',
    '-archivePath', iosArchive,
    '-exportPath', iosExport,
    '-exportOptionsPlist', 'ios/ExportOptions.plist',
  ]);
  iosPackage();
}

function iosPackage() {
  requireFile(iosExport, 'iOS export directory');
  const ipa = readdirSync(iosExport).find((name) => name.endsWith('.ipa'));
  if (!ipa) throw new Error(`No IPA found in ${iosExport}`);
  return join(iosExport, ipa);
}

function uploadAndroid() {
  requireFile(androidBundle, 'Signed Android App Bundle');
  requireFile(googleCredentials, 'Google Play service-account credentials');
  const track = process.env.GOOGLE_PLAY_TRACK ?? 'internal';
  const status = process.env.GOOGLE_PLAY_RELEASE_STATUS ?? 'completed';
  run('node', [
    'tools/google-play-upload.mjs',
    '--bundle', androidBundle,
    '--track', track,
    '--status', status,
    '--name', `${version} (${androidVersionCode}) - Internal`,
  ], { env: { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: googleCredentials } });
}

function uploadIos() {
  const ipa = iosPackage();
  requireFile(join(appleKeysDir, `AuthKey_${appleKeyId}.p8`), 'App Store Connect API key');
  const authArgs = ['--api-key', appleKeyId, '--api-issuer', appleIssuerId];
  const env = { API_PRIVATE_KEYS_DIR: appleKeysDir };
  run('xcrun', ['altool', '--validate-app', '-f', ipa, ...authArgs], { env });
  run('xcrun', ['altool', '--upload-app', '-f', ipa, ...authArgs], { env });
  run('node', [
    'tools/app-store-connect-release.mjs',
    '--version', version,
    '--build', iosBuild,
  ], { env });
}

assertVersions();

if (mode === 'all' || mode === 'build') {
  checksAndSync();
  buildAndroid();
  buildIos();
}
if (mode === 'android') {
  checksAndSync();
  buildAndroid();
  uploadAndroid();
}
if (mode === 'ios') {
  checksAndSync();
  buildIos();
  uploadIos();
}
if (mode === 'all' || mode === 'upload') {
  uploadAndroid();
  uploadIos();
}

console.log(`\nStoneSiege ${version} mobile release command completed.`);
