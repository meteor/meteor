const fs = require('node:fs');
const path = require('node:path');
const {
  applyRstestCoverageToSwcRule,
  readRstestCoveragePlan,
  resolveRstestCoverageSwcPlugin,
} = require('./rstest-coverage.js');

function hasTypescriptRstestInputs({ files = [], setupFiles = [] } = {}) {
  return [...files, ...setupFiles].some(file =>
    typeof file === 'string' && /\.(?:[cm]?ts|tsx)$/i.test(file)
  );
}

function isRstestRuntimeBuild({
  testRunner,
  testRunnerContext = {},
  isTest,
} = {}) {
  const runner = testRunner || testRunnerContext.testRunner;
  const runtime = testRunnerContext.runtime;
  return runner === 'rstest' && (
    runtime === true || (runtime === undefined && Boolean(isTest))
  );
}

function readRstestRuntimeInventory({ manifest, projectDir, client }) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  } catch {
    throw new Error('[Meteor Rstest] Invalid runtime file inventory from Meteor CLI.');
  }
  if (Array.isArray(parsed)) {
    return {
      discoveryRoot: path.resolve(
        projectDir,
        `tests/rstest/runtime/${client ? 'client' : 'server'}`,
      ),
      files: parsed,
    };
  }
  if (!parsed || parsed.schemaVersion !== 2 ||
      !Array.isArray(parsed.serverFiles) || !Array.isArray(parsed.clientFiles)) {
    throw new Error('[Meteor Rstest] Invalid runtime file inventory from Meteor CLI.');
  }
  if (parsed.discoveryRoot !== undefined &&
      (typeof parsed.discoveryRoot !== 'string' ||
        !path.isAbsolute(parsed.discoveryRoot))) {
    throw new Error('[Meteor Rstest] Invalid runtime file inventory from Meteor CLI.');
  }
  if (parsed.testFileRoot !== undefined && (
    typeof parsed.testFileRoot !== 'string' ||
    path.isAbsolute(parsed.testFileRoot) ||
    parsed.testFileRoot.split(/[\\/]/).includes('..')
  )) {
    throw new Error('[Meteor Rstest] Invalid runtime file inventory from Meteor CLI.');
  }
  return {
    discoveryRoot: parsed.discoveryRoot || path.resolve(projectDir),
    files: client ? parsed.clientFiles : parsed.serverFiles,
    ...(parsed.testFileRoot !== undefined && {
      testFileRoot: parsed.testFileRoot,
    }),
  };
}

function readRstestRuntimeSettings(filename) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    throw new Error('[Meteor Rstest] Invalid runtime settings from Meteor CLI.');
  }
  if (!parsed || parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.setupFiles) ||
      parsed.setupFiles.some(file => typeof file !== 'string' ||
        !path.isAbsolute(file))) {
    throw new Error('[Meteor Rstest] Invalid runtime settings from Meteor CLI.');
  }
  return parsed;
}

module.exports = {
  applyRstestCoverageToSwcRule,
  hasTypescriptRstestInputs,
  isRstestRuntimeBuild,
  readRstestCoveragePlan,
  readRstestRuntimeInventory,
  readRstestRuntimeSettings,
  resolveRstestCoverageSwcPlugin,
};
