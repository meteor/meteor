// Installed next to the fixture's Capacitor CLI so config loading and sync use
// the real CLI. Only Xcode and Gradle compilation are simulated.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async function buildFixture(args, gradle) {
  const { extConfig: config } = (await require('../dist/config').loadConfig()).app;
  const opts = config.android.buildOptions;
  const androidDir = path.resolve(config.android.path || 'android');
  const key = path.resolve(androidDir, opts.keystorePath);
  const runSigner = (tool, args, password) => execFileSync(tool, [
    '-keystore', key, '-storepass:env', 'FIXTURE_STORE_PASSWORD', ...args,
  ], { env: { ...process.env, FIXTURE_STORE_PASSWORD: password } });
  if (gradle && args.includes(':app:signingReport')) {
    if (!fs.existsSync(key)) {
      runSigner('keytool', ['-genkeypair', '-keyalg', 'RSA', '-storetype', 'PKCS12',
        '-alias', opts.keystoreAlias, '-dname', 'CN=E2E fixture'], opts.keystorePassword);
    }
    console.log('Variant: release\nConfig: null');
    return;
  }
  const platform = gradle ? 'android' : args[1];
  const override = args.indexOf('--androidreleasetype');
  const format = gradle ? 'AAB' : (override >= 0 ? args[override + 1] : opts.releaseType);
  const nativeDir = path.resolve(config[platform]?.path || platform);
  const synced = platform === 'ios' ? 'App/App/public/index.html' : 'app/src/main/assets/public/index.html';
  if (!fs.existsSync(path.join(nativeDir, synced))) throw new Error('Build invoked before native sync');
  const password = gradle ? process.env['ORG_GRADLE_PROJECT_android.injected.signing.store.password'] : opts.keystorePassword;
  const result = { platform, args, format, appId: config.appId, rootUrl: config.plugins.MeteorE2E.rootUrl,
    hasSigningConfig: password === opts.keystorePassword };
  console.log('build settings: ' + password);
  const callsPath = path.join('_build', 'native-build-calls.json');
  const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath)) : [];
  fs.writeFileSync(callsPath, JSON.stringify([...calls, result]));
  if (process.env.CAPACITOR_E2E_BUILD_EXIT) process.exit(Number(process.env.CAPACITOR_E2E_BUILD_EXIT));
  if (process.env.CAPACITOR_E2E_BUILD_SKIP_ARTIFACT) return;
  const artifact = path.join(nativeDir, platform === 'ios' ? 'App/output/fixture.ipa' : gradle
    ? 'app/build/outputs/bundle/release/app-release.aab' : 'app/build/outputs/apk/release/app-release-signed.apk');
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  if (gradle) {
    const payload = fs.mkdtempSync(path.join('.meteor/local', 'bundle-fixture-'));
    if (!process.env.CAPACITOR_E2E_EMPTY) {
      fs.mkdirSync(path.join(payload, 'base/manifest'), { recursive: true });
      fs.writeFileSync(path.join(payload, 'BundleConfig.pb'), 'fixture config');
      fs.writeFileSync(path.join(payload, 'base/manifest/AndroidManifest.xml'), 'fixture manifest');
    }
    execFileSync('jar', ['--create', '--file', artifact, '-C', payload, '.']);
    if (!process.env.CAPACITOR_E2E_UNSIGNED && !process.env.CAPACITOR_E2E_EMPTY) {
      let alias = opts.keystoreAlias;
      if (process.env.CAPACITOR_E2E_WRONG_SIGNER) {
        alias = 'other-' + Date.now();
        runSigner('keytool', ['-genkeypair', '-keyalg', 'RSA', '-alias', alias,
          '-dname', 'CN=Other fixture signer'], password);
      }
      runSigner('jarsigner', [artifact, alias], password);
    }
  } else {
    fs.writeFileSync(artifact, JSON.stringify(result));
  }
};
