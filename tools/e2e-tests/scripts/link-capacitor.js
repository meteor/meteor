#!/usr/bin/env node

/**
 * Links the local npm-packages/meteor-capacitor into a Meteor app so E2E tests
 * run against the repository version.
 */

const path = require('path');
const execa = require('execa');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CAPACITOR_PACKAGE_DIR = path.join(REPO_ROOT, 'npm-packages', 'meteor-capacitor');
const NPM_QUIET_INSTALL_FLAGS = ['--no-audit', '--no-fund'];

async function linkLocalCapacitor(appDir, { env } = {}) {
  if (process.env.NPM_LINK_CAPACITOR === 'false') {
    console.warn('NPM_LINK_CAPACITOR=false, using the app dependency for @meteorjs/capacitor.');
    return;
  }

  const execOpts = env ? { env: { ...process.env, ...env } } : {};

  console.log(`Installing local meteor-capacitor from ${CAPACITOR_PACKAGE_DIR}...`);
  await execa(
    'npm',
    [
      'install',
      CAPACITOR_PACKAGE_DIR,
      '--save-dev',
      '--no-package-lock',
      ...NPM_QUIET_INSTALL_FLAGS,
    ],
    {
      cwd: appDir,
      stdio: 'inherit',
      ...execOpts,
    }
  );

  console.log('Local meteor-capacitor installed successfully.');
}

module.exports = { linkLocalCapacitor, REPO_ROOT, CAPACITOR_PACKAGE_DIR };

if (require.main === module) {
  const appDir = process.argv[2];
  if (!appDir) {
    console.error('Usage: node link-capacitor.js <appDir>');
    process.exit(1);
  }
  linkLocalCapacitor(path.resolve(appDir)).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
