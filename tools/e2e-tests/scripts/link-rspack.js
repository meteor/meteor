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
 *
 */

const path = require('path');
const fs = require('fs');
const execa = require('execa');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const METEOR_EXECUTABLE = path.join(REPO_ROOT, 'meteor');
const RSPACK_PACKAGE_DIR = path.join(REPO_ROOT, 'npm-packages', 'meteor-rspack');
const CONSTANTS_PATH = path.join(REPO_ROOT, 'packages', 'rspack', 'lib', 'constants.js');

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
    rsdoctorRspackPluginVersion: readVersion('DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION'),
  };
}

async function linkLocalRspack(appDir, { env, packageManager } = {}) {
  const execOpts = env ? { env: { ...process.env, ...env } } : {};
  const pnpmProject = isPnpmProject(appDir, packageManager);
  const {
    rspackVersion,
    rsdoctorRspackPluginVersion,
  } = readRspackVersions();

  if (pnpmProject) {
    const deps = [
      'ignore-loader',
      RSPACK_PACKAGE_DIR,
      rspackVersion && `@rspack/core@${rspackVersion}`,
      rspackVersion && `@rspack/cli@${rspackVersion}`,
      rsdoctorRspackPluginVersion && `@rsdoctor/rspack-plugin@${rsdoctorRspackPluginVersion}`,
    ].filter(Boolean);

    console.log(`Installing/linking local meteor-rspack with pnpm in ${appDir}...`);
    await execa('corepack', ['pnpm', 'add', '-D', ...deps], {
      cwd: appDir,
      stdio: 'inherit',
      ...execOpts,
    });

    console.log('Local meteor-rspack linked successfully.');
    return;
  }

  console.log(`Running meteor update --npm in ${appDir}...`);
  await execa(METEOR_EXECUTABLE, ['update', '--npm'], {
    cwd: appDir,
    stdio: 'inherit',
    ...execOpts,
  });

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
