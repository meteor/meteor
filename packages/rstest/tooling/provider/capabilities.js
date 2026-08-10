const path = require('node:path');
const { createRequire } = require('node:module');

const CAPABILITIES = Object.freeze({
  dom: Object.freeze({
    label: 'DOM tests',
    requirements: Object.freeze([
      Object.freeze({ anyOf: Object.freeze(['jsdom']), install: 'jsdom' }),
    ]),
  }),
  browser: Object.freeze({
    label: 'Rstest Browser Mode',
    requirements: Object.freeze([
      Object.freeze({ anyOf: Object.freeze(['@rstest/browser']), install: '@rstest/browser' }),
      Object.freeze({ anyOf: Object.freeze(['playwright']), install: 'playwright' }),
    ]),
    browserBinary: true,
  }),
  'meteor-client': Object.freeze({
    label: 'Meteor client runtime tests',
    requirements: Object.freeze([
      Object.freeze({ anyOf: Object.freeze(['playwright']), install: 'playwright' }),
    ]),
    browserBinary: true,
  }),
  e2e: Object.freeze({
    label: 'Rstest Playwright E2E tests',
    requirements: Object.freeze([
      Object.freeze({ anyOf: Object.freeze(['@rstest/playwright']), install: '@rstest/playwright' }),
      Object.freeze({ anyOf: Object.freeze(['playwright']), install: 'playwright' }),
    ]),
    browserBinary: true,
  }),
  coverage: Object.freeze({
    label: 'Rstest coverage',
    requirements: Object.freeze([
      Object.freeze({
        anyOf: Object.freeze([
          '@rstest/coverage-istanbul',
          '@rstest/coverage-v8',
        ]),
        install: '@rstest/coverage-istanbul',
      }),
    ]),
  }),
});

function hasRoot(files, root) {
  const matcher = new RegExp(`[\\\\/]tests[\\\\/]rstest[\\\\/]${root}[\\\\/]`);
  return [].concat(files || []).some(file => matcher.test(file));
}

function selectRstestOptionalCapabilities({
  command,
  inventory,
  coverage = false,
  client = true,
}) {
  const selected = [];
  if (hasRoot(inventory.pureFiles, 'pure[\\\\/]client')) selected.push('dom');
  if (hasRoot(inventory.pureFiles, 'browser')) selected.push('browser');
  if (hasRoot(inventory.runtimeFiles, 'runtime[\\\\/]client') ||
      command === 'test-packages' && client) {
    selected.push('meteor-client');
  }
  if (hasRoot(inventory.externalFiles, 'e2e')) selected.push('e2e');
  if (coverage) selected.push('coverage');
  return selected;
}

function projectCanResolve(appDir, packageName) {
  const projectRequire = createRequire(path.join(appDir, 'package.json'));
  try {
    projectRequire.resolve(`${packageName}/package.json`);
    return true;
  } catch {}
  try {
    projectRequire.resolve(packageName);
    return true;
  } catch {}
  return false;
}

function assertRstestOptionalCapabilities({
  appDir,
  capabilities,
  canResolve = projectCanResolve,
}) {
  const selected = [...new Set([].concat(capabilities || []))];
  const missingCapabilities = [];
  const installPackages = [];
  let needsBrowserBinary = false;

  for (const id of selected) {
    const capability = CAPABILITIES[id];
    if (!capability) continue;
    let missing = false;
    for (const requirement of capability.requirements) {
      if (requirement.anyOf.some(name => canResolve(appDir, name))) continue;
      missing = true;
      if (!installPackages.includes(requirement.install)) {
        installPackages.push(requirement.install);
      }
    }
    if (missing) {
      missingCapabilities.push(capability.label);
      needsBrowserBinary ||= capability.browserBinary === true;
    }
  }

  if (installPackages.length === 0) return;

  const error = new Error(
    `[Meteor Rstest] ${missingCapabilities.join(', ')} require project-owned ` +
    `npm dependencies. Install them explicitly:\n\n` +
    `  meteor npm install --save-dev ${installPackages.join(' ')}\n` +
    (needsBrowserBinary
      ? '\nThen install selected browser binary:\n\n  npx playwright install chromium\n'
      : '')
  );
  error.code = 'METEOR_RSTEST_OPTIONAL_DEPENDENCY_MISSING';
  throw error;
}

module.exports = {
  assertRstestOptionalCapabilities,
  selectRstestOptionalCapabilities,
};
