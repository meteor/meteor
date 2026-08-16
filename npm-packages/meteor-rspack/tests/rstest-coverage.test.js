const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  applyRstestCoverageToSwcRule,
  readRstestCoveragePlan,
  resolveRstestCoverageSwcPlugin,
} = require('../lib/rstest-coverage.js');

function coveragePlan(overrides = {}) {
  return {
    schemaVersion: 1,
    generation: 'generation-1',
    enabled: true,
    provider: 'istanbul',
    root: '/app',
    include: [],
    exclude: ['**/*.test.js'],
    allowExternal: false,
    artifactRoot: '/app/.meteor/local/rstest/coverage/generation-1',
    ...overrides,
  };
}

test('coverage-disabled plans leave the original SWC rule untouched', () => {
  const rule = {
    options: {
      jsc: {
        experimental: {
          plugins: [['/plugins/user.wasm', { feature: true }]],
        },
      },
    },
  };
  const before = structuredClone(rule);

  const returned = applyRstestCoverageToSwcRule(rule, {
    plan: coveragePlan({ enabled: false }),
  });

  assert.equal(returned, rule);
  assert.deepEqual(rule, before);
});

test('Istanbul coverage appends its exact exclusions after existing SWC plugins once', () => {
  const coveragePlugin = '/app/node_modules/swc-plugin-coverage-instrument/plugin.wasm';
  const rule = {
    options: {
      jsc: {
        experimental: {
          plugins: [['/plugins/user.wasm', { feature: true }]],
        },
      },
    },
  };

  applyRstestCoverageToSwcRule(rule, {
    plan: coveragePlan(),
    pluginPath: coveragePlugin,
  });
  applyRstestCoverageToSwcRule(rule, {
    plan: coveragePlan(),
    pluginPath: coveragePlugin,
  });

  assert.deepEqual(rule.options.jsc.experimental.plugins, [
    ['/plugins/user.wasm', { feature: true }],
    [coveragePlugin, { unstableExclude: ['**/*.test.js'] }],
  ]);
});

test('Meteor-hosted coverage rejects the V8 provider', () => {
  assert.throws(
    () => applyRstestCoverageToSwcRule(
      { options: { jsc: {} } },
      {
        plan: coveragePlan({ provider: 'v8' }),
        pluginPath: '/plugins/coverage.wasm',
      },
    ),
    /Istanbul provider/,
  );
});

test('coverage plans reject stale generations before instrumentation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-coverage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filename = path.join(root, 'plan.json');
  fs.writeFileSync(filename, JSON.stringify(coveragePlan({
    root,
    artifactRoot: path.join(root, 'artifacts'),
  })));

  assert.deepEqual(
    readRstestCoveragePlan(filename, { generation: 'generation-1' }),
    coveragePlan({ root, artifactRoot: path.join(root, 'artifacts') }),
  );
  assert.throws(
    () => readRstestCoveragePlan(filename, { generation: 'generation-2' }),
    /invalid or stale coverage plan/i,
  );
});

test('SWC coverage plugin resolves from the app-selected Istanbul provider dependency', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const coordinatorRoot = path.join(root, 'node_modules', '@meteorjs', 'rstest');
  const coordinatorEntry = path.join(coordinatorRoot, 'index.js');
  const providerRoot = path.join(
    coordinatorRoot,
    'node_modules',
    '@rstest',
    'coverage-istanbul',
  );
  const providerEntry = path.join(providerRoot, 'dist', 'index.js');
  const pluginRoot = path.join(
    providerRoot,
    'node_modules',
    'swc-plugin-coverage-instrument',
  );
  const pluginPath = path.join(pluginRoot, 'coverage.wasm');
  fs.mkdirSync(path.dirname(providerEntry), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(coordinatorEntry, 'module.exports = {};');
  fs.writeFileSync(path.join(coordinatorRoot, 'package.json'), JSON.stringify({
    name: '@meteorjs/rstest',
    main: 'index.js',
  }));
  fs.writeFileSync(providerEntry, 'module.exports = {};');
  fs.writeFileSync(path.join(providerRoot, 'package.json'), JSON.stringify({
    name: '@rstest/coverage-istanbul',
    main: 'dist/index.js',
  }));
  fs.writeFileSync(path.join(pluginRoot, 'package.json'), JSON.stringify({
    name: 'swc-plugin-coverage-instrument',
    main: 'coverage.wasm',
  }));
  fs.writeFileSync(pluginPath, 'wasm');

  assert.equal(
    resolveRstestCoverageSwcPlugin({ npmRoot: root }),
    fs.realpathSync(pluginPath),
  );

  const planPath = path.join(root, 'coverage-plan.json');
  fs.writeFileSync(planPath, JSON.stringify(coveragePlan({
    root,
    artifactRoot: path.join(root, 'coverage'),
  })));
  const rule = { options: { jsc: {} } };
  applyRstestCoverageToSwcRule(rule, {
    plan: readRstestCoveragePlan(planPath, { generation: 'generation-1' }),
    pluginPath: resolveRstestCoverageSwcPlugin({ npmRoot: root }),
  });
  assert.deepEqual(rule.options.jsc.experimental.plugins, [[
    fs.realpathSync(pluginPath),
    { unstableExclude: ['**/*.test.js'] },
  ]]);
});
