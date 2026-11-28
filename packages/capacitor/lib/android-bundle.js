const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { randomBytes, X509Certificate } = require('crypto');
const execFile = require('util').promisify(require('child_process').execFile);

export function gradleWrapper(nativeDir) {
  // Batch launchers run in a shell. Invoke the wrapper from its working
  // directory so project paths containing shell metacharacters stay data.
  return process.platform === 'win32' ? '.\\gradlew.bat' : path.join(nativeDir, 'gradlew');
}

function jdk(tool, args, env) {
  const command = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', tool) : tool;
  return execFile(command, args, { env: { ...process.env, ...env } });
}

// Ask the Android Gradle plugin which certificate the selected variant uses.
// This includes signing configurations inherited from flavors or build types.
async function nativeSigningFingerprint(nativeDir, bundleVariant, env) {
  let stdout;
  try {
    ({ stdout } = await execFile(gradleWrapper(nativeDir), ['-q', '--console=plain', ':app:signingReport'], {
      cwd: nativeDir, env, shell: process.platform === 'win32',
    }));
  } catch (error) {
    throw new Error(`Gradle :app:signingReport failed for ${bundleVariant} (${error.code}). Check the native signing configuration.`);
  }
  const section = stdout.split(/^Variant: /m).slice(1).find(block => block.split(/\r?\n/, 1)[0] === bundleVariant);
  const fingerprint = section?.match(/^SHA-256: ((?:[\da-f]{2}:){31}[\da-f]{2})\s*$/im)?.[1].toUpperCase();
  if (!section || (!fingerprint && !/^Config: null\s*$/m.test(section))) {
    throw new Error(`Cannot determine the Gradle signing certificate for ${bundleVariant}. Check :app:signingReport.`);
  }
  return fingerprint;
}

export async function resolveBundleSigning({ nativeDir, bundleVariant, signingOptions }, nativeEnv) {
  const fingerprint = await nativeSigningFingerprint(nativeDir, bundleVariant, nativeEnv);
  const { keystorePath, keystorePassword, keystoreAlias, keystoreAliasPassword } = signingOptions;
  if (keystorePath || keystoreAlias || keystorePassword || keystoreAliasPassword) {
    if (!keystorePath || !keystoreAlias || !keystorePassword) {
      throw new Error('Capacitor Android bundle signing requires keystorePath, keystoreAlias and keystorePassword.');
    }
    const store = path.resolve(nativeDir, keystorePath);
    if (fingerprint) {
      const { stdout: pem } = await jdk('keytool', ['-exportcert', '-rfc', '-keystore', store,
        '-alias', keystoreAlias, '-storepass:env', 'METEOR_BUNDLE_STORE_PASSWORD'], { METEOR_BUNDLE_STORE_PASSWORD: keystorePassword });
      if (fingerprint !== new X509Certificate(pem).fingerprint256) {
        throw new Error(`Gradle and Capacitor select different signing certificates for ${bundleVariant}.`);
      }
    }
    // Android Studio uses these same Gradle properties for an external signer.
    // Supply them only when the native project has no signer for this variant.
    const gradleEnv = fingerprint ? {} : {
      'ORG_GRADLE_PROJECT_android.injected.signing.store.file': store,
      'ORG_GRADLE_PROJECT_android.injected.signing.store.password': keystorePassword,
      'ORG_GRADLE_PROJECT_android.injected.signing.key.alias': keystoreAlias,
      'ORG_GRADLE_PROJECT_android.injected.signing.key.password': keystoreAliasPassword || keystorePassword,
    };
    return { gradleEnv, verify: bundle => verifyWithStore(bundle, store, keystorePassword, keystoreAlias) };
  }

  if (!fingerprint) {
    throw new Error(`Configure a Gradle release signingConfig for ${bundleVariant} or supply Capacitor android.buildOptions keystore settings.`);
  }
  return { verify: bundle => verifyWithFingerprint(bundle, fingerprint) };
}

async function verifyWithStore(bundle, store, password, alias) {
  // jarsigner -verify -strict exits successfully for a manifest-only unsigned
  // JAR. Require the bundle's two mandatory payload entries before trusting it.
  const required = ['BundleConfig.pb', 'base/manifest/AndroidManifest.xml'];
  const { stdout } = await jdk('jar', ['--list', '--file', bundle, ...required]);
  const entries = new Set(stdout.trim().split(/\r?\n/));
  if (!required.every(entry => entries.has(entry))) {
    throw new Error('Android App Bundle is missing its configuration or base module manifest.');
  }
  try {
    await jdk('jarsigner', ['-verify', '-strict', '-keystore', store, '-storepass:env',
      'METEOR_BUNDLE_STORE_PASSWORD', bundle, alias], { METEOR_BUNDLE_STORE_PASSWORD: password });
  } catch (error) {
    throw new Error(`Android App Bundle signature verification failed for the selected signer: ${error.message}`);
  }
}

async function verifyWithFingerprint(bundle, fingerprint) {
  // The native project's private keystore password belongs to Gradle. Trust
  // only its reported certificate when jarsigner verifies every signed entry.
  const { stdout } = await jdk('keytool', ['-printcert', '-rfc', '-jarfile', bundle]);
  const certificates = stdout.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  const pem = certificates.find(cert => new X509Certificate(cert).fingerprint256 === fingerprint);
  if (!pem) throw new Error('Android App Bundle is missing the selected Gradle signing certificate.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'meteor-bundle-cert-'));
  try {
    const cert = path.join(dir, 'signer.pem');
    const store = path.join(dir, 'trusted.p12');
    const password = randomBytes(24).toString('hex');
    await fs.writeFile(cert, pem);
    await jdk('keytool', ['-importcert', '-noprompt', '-alias', 'upload', '-file', cert, '-keystore', store,
      '-storetype', 'PKCS12', '-storepass:env', 'METEOR_BUNDLE_STORE_PASSWORD'], { METEOR_BUNDLE_STORE_PASSWORD: password });
    await verifyWithStore(bundle, store, password, 'upload');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
