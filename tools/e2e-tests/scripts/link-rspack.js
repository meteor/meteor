#!/usr/bin/env node

/**
 * Backward-compatible Rspack-only entry point for E2E fixtures.
 * Uses project-local file links; never mutates npm's global prefix.
 */

const path = require('node:path');
const {
  REPO_ROOT,
  linkLocalModernTools,
} = require('./link-modern-tools.js');

const METEOR_EXECUTABLE = path.join(REPO_ROOT, 'meteor');
const RSPACK_PACKAGE_DIR = path.join(REPO_ROOT, 'npm-packages', 'meteor-rspack');

async function linkLocalRspack(appDir, { env } = {}) {
  return linkLocalModernTools(appDir, { env, includeRstest: false });
}

module.exports = { linkLocalRspack, REPO_ROOT, METEOR_EXECUTABLE, RSPACK_PACKAGE_DIR };

if (require.main === module) {
  const appDir = process.argv[2];
  if (!appDir) {
    console.error('Usage: node link-rspack.js <appDir>');
    process.exit(1);
  }
  linkLocalRspack(path.resolve(appDir)).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
