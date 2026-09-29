#!/usr/bin/env node

/**
 * Links the local npm-packages/meteor-rspack into a Meteor app so it runs
 * against the latest dev version.
 *
 * Steps:
 *   1. Run `meteor update --npm` in the app
 *   2. Install the matching @rspack/core and @rspack/cli versions into the
 *      local meteor-rspack package (read from packages/rspack/lib/constants.js)
 *   3. Install `ignore-loader` in the app
 *   4. `npm link` the local meteor-rspack into the app
 *   5. Verify SWC's native parser from both installation directories
 *
 */

const path = require('path');
const fs = require('fs');
const execa = require('execa');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const METEOR_EXECUTABLE = path.join(REPO_ROOT, 'meteor');
const METEOR_NODE_EXECUTABLE = path.join(
  REPO_ROOT, 'dev_bundle', 'bin', process.platform === 'win32' ? 'node.exe' : 'node'
);
const RSPACK_PACKAGE_DIR = path.join(REPO_ROOT, 'npm-packages', 'meteor-rspack');
const CONSTANTS_PATH = path.join(REPO_ROOT, 'packages', 'rspack', 'lib', 'constants.js');

/**
 * Exercise the native parser with the Node binary Meteor will run. Loader and
 * cache warnings omit Error.cause; an uncaught setup error preserves the actual
 * missing module or dynamic-library error before repeated startup timeouts.
 */
async function verifySwcNativeBinding(cwd, execOpts) {
  console.log(`Checking SWC native parser in ${cwd}...`);

  await execa(METEOR_NODE_EXECUTABLE, ['--eval', `
    const swcPath = require.resolve('@swc/core');
    console.log('[SWC native parser]', process.version, process.platform, process.arch, swcPath);

    const swc = require(swcPath);
    swc.parseSync('const verified = true;');
    console.log('[SWC native parser]', swc.version, swc.getBinaryMetadata?.());
  `], { cwd, stdio: 'inherit', ...execOpts });
}

async function linkLocalRspack(appDir, { env } = {}) {
  if (!appDir || !fs.existsSync(appDir)) {
    // Fail fast with the real story: when an earlier app-creation phase
    // fails or times out, the suite's shared tempDir stays undefined and
    // this used to surface as a confusing "missing projectDir!" from a
    // `meteor update --npm` spawned with cwd undefined (i.e. the jest
    // working directory), burying the initiating error.
    throw new Error(
      `linkLocalRspack: invalid app directory (${appDir}). ` +
      'The test app was probably never created - look at the earlier ' +
      'app-creation step in this suite for the initiating failure.'
    );
  }
  const execOpts = env ? { env: { ...process.env, ...env } } : {};

  console.log(`Running meteor update --npm in ${appDir}...`);
  await execa(METEOR_EXECUTABLE, ['update', '--npm'], {
    cwd: appDir,
    stdio: 'inherit',
    ...execOpts,
  });

  const constantsContent = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  const rspackVersionMatch = constantsContent.match(
    /DEFAULT_RSPACK_VERSION\s*=\s*['"]([^'"]+)['"]/
  );
  const rspackVersion = rspackVersionMatch?.[1];
  if (rspackVersion) {
    console.log(`Installing @rspack/core@${rspackVersion} and @rspack/cli@${rspackVersion}...`);
    await execa(
      'npm',
      [
        'install',
        `@rspack/core@${rspackVersion}`,
        `@rspack/cli@${rspackVersion}`,
        '--no-save',
        '--no-package-lock',
      ],
      { cwd: RSPACK_PACKAGE_DIR }
    );
  }

  console.log('Installing ignore-loader in the app...');
  await execa('npm', ['install', 'ignore-loader', '--save'], { cwd: appDir });

  console.log(`Linking local meteor-rspack from ${RSPACK_PACKAGE_DIR}...`);
  await execa('npm', ['link', RSPACK_PACKAGE_DIR], { cwd: appDir });

  await verifySwcNativeBinding(RSPACK_PACKAGE_DIR, execOpts);
  await verifySwcNativeBinding(appDir, execOpts);

  console.log('Local meteor-rspack linked successfully.');
}

module.exports = { linkLocalRspack, REPO_ROOT, METEOR_EXECUTABLE, RSPACK_PACKAGE_DIR };

// CLI mode
if (require.main === module) {
  const appDir = process.argv[2];
  if (!appDir) {
    console.error('Usage: node link-rspack.js <appDir>');
    process.exit(1);
  }
  linkLocalRspack(path.resolve(appDir)).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
