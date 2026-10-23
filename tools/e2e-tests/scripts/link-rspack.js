#!/usr/bin/env node

/**
 * Installs a tarball of the local npm-packages/meteor-rspack into a Meteor app.
 * This exercises the published package layout: a repository symlink resolves
 * app-owned plugins from the checkout instead of the app's dependency tree.
 * Install before syncing dependencies so unpublished versions remain testable.
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
async function verifySwcNativeBinding(cwd, execOpts, { optional = false } = {}) {
  let swcPath;

  try {
    swcPath = require.resolve('@swc/core', { paths: [cwd] });
  } catch (error) {
    // Apps without a standalone SWC loader can use only the adapter's parser.
    if (optional && error.code === 'MODULE_NOT_FOUND') {
      return;
    }

    throw error;
  }

  console.log(`Checking SWC native parser in ${cwd}...`);

  await execa(METEOR_NODE_EXECUTABLE, ['--eval', `
    const swcPath = process.argv[1];
    console.log('[SWC native parser]', process.version, process.platform, process.arch, swcPath);

    const swc = require(swcPath);
    swc.parseSync('const verified = true;');
    console.log('[SWC native parser]', swc.version, swc.getBinaryMetadata?.());
  `, swcPath], { cwd, stdio: 'inherit', ...execOpts });
}

function findUp(startDir, fileName) {
  let currentDir = startDir;
  while (currentDir !== path.dirname(currentDir)) {
    const candidate = path.join(currentDir, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

function isPnpmProject(appDir, packageManager) {
  if (packageManager === 'pnpm') {
    return true;
  }

  if (findUp(appDir, 'pnpm-workspace.yaml')) {
    return true;
  }

  try {
    const packageJsonPath = path.join(appDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.packageManager?.includes('pnpm') === true;
  } catch (error) {
    return false;
  }
}

function readRspackVersions() {
  const constantsContent = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  const readVersion = (name) => {
    const match = constantsContent.match(new RegExp(`${name}\\s*=\\s*['"]([^'"]+)['"]`));
    return match?.[1];
  };

  return {
    rspackVersion: readVersion('DEFAULT_RSPACK_VERSION'),
    rspackDevServerVersion: readVersion('DEFAULT_RSPACK_DEV_SERVER_VERSION'),
    rsdoctorRspackPluginVersion: readVersion('DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION'),
  };
}

async function linkLocalRspack(appDir, { env, packageManager } = {}) {
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
  const pnpmProject = isPnpmProject(appDir, packageManager);
  const {
    rspackVersion,
    rspackDevServerVersion,
    rsdoctorRspackPluginVersion,
  } = readRspackVersions();

  // Keep the tarball with the disposable app for later dependency installs.
  // It must survive `meteor reset` and retry cleanup of .meteor/local.
  const packDir = path.join(appDir, '.e2e-rspack');
  fs.mkdirSync(packDir, { recursive: true });
  const { stdout } = await execa(
    'npm',
    ['pack', RSPACK_PACKAGE_DIR, '--json', '--pack-destination', packDir],
    { cwd: appDir, ...execOpts }
  );
  const [{ filename }] = JSON.parse(stdout);
  const packageTarball = path.join(packDir, filename);

  if (pnpmProject) {
    const deps = [
      'ignore-loader',
      packageTarball,
      rspackVersion && `@rspack/core@${rspackVersion}`,
      rspackVersion && `@rspack/cli@${rspackVersion}`,
      rspackDevServerVersion && `@rspack/dev-server@${rspackDevServerVersion}`,
      rsdoctorRspackPluginVersion && `@rsdoctor/rspack-plugin@${rsdoctorRspackPluginVersion}`,
    ].filter(Boolean);

    console.log(`Installing packed local meteor-rspack with pnpm in ${appDir}...`);
    await execa('corepack', ['pnpm', 'add', '-D', ...deps], {
      cwd: appDir,
      stdio: 'inherit',
      ...execOpts,
    });

    const installedAdapterDir = path.dirname(
      require.resolve('@meteorjs/rspack/package.json', { paths: [appDir] })
    );
    await verifySwcNativeBinding(installedAdapterDir, execOpts);
    await verifySwcNativeBinding(appDir, execOpts, { optional: true });

    console.log('Local meteor-rspack installed successfully.');
    return;
  }

  console.log(`Installing local meteor-rspack from ${packageTarball}...`);
  await execa('npm', ['install', '--save-dev', packageTarball], {
    cwd: appDir,
    ...execOpts,
  });

  console.log(`Running meteor update --npm in ${appDir}...`);
  await execa(METEOR_EXECUTABLE, ['update', '--npm'], {
    cwd: appDir,
    stdio: 'inherit',
    ...execOpts,
  });

  console.log('Installing ignore-loader in the app...');
  await execa('npm', ['install', 'ignore-loader', '--save'], { cwd: appDir });

  const installedAdapterDir = path.dirname(
    require.resolve('@meteorjs/rspack/package.json', { paths: [appDir] })
  );
  await verifySwcNativeBinding(installedAdapterDir, execOpts);
  await verifySwcNativeBinding(appDir, execOpts, { optional: true });

  console.log('Local meteor-rspack installed successfully.');
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
