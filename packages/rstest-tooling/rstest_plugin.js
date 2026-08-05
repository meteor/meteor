/**
 * @module rstest_plugin
 * @description Rstest dependency bootstrap for Meteor test commands
 */

const {
  ensureRstestInstalled,
  shouldEnsureRstestDependencies,
} = require('./lib/dependencies.js');
const {
  hasMeteorAppConfigAutoInstallDeps,
  isMeteorAppTest,
  isMeteorPackagesTest,
} = require('meteor/tools-core/lib/meteor');
const { logError } = require('meteor/tools-core/lib/log');

if (shouldEnsureRstestDependencies({
  testRunner: process.env.METEOR_TEST_RUNNER,
  isAppTestCommand: isMeteorAppTest(),
  isPackagesTestCommand: isMeteorPackagesTest(),
  autoInstallDeps: hasMeteorAppConfigAutoInstallDeps(),
})) {
  try {
    await ensureRstestInstalled();
  } catch (error) {
    logError(`Rstest plugin error: ${error.message}`);
    throw error;
  }
}
