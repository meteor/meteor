const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  RstestTestRunnerProvider,
} = require('../provider/provider.js');

function createContext(t, overrides = {}) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-provider-'));
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(appDir, '.meteor'), { recursive: true });
  fs.writeFileSync(path.join(appDir, '.meteor', 'packages'), 'rstest\nrspack\n');
  fs.writeFileSync(path.join(appDir, 'package.json'), '{"meteor":{}}\n');
  return {
    command: 'test',
    appDir,
    harnessRoot: appDir,
    localDir: path.join(appDir, '.meteor', 'local'),
    architectures: ['os.test'],
    webArchs: ['web.browser'],
    options: {
      once: true,
      fullApp: false,
      serverOnly: false,
      clientOnly: false,
      project: [],
      testFile: [],
      passthrough: [],
    },
    npm: {
      root: appDir,
      autoInstall: true,
      async ensureHarnessManifest() {},
    },
    ...overrides,
  };
}

function argumentValues(args, flag) {
  return args.flatMap((value, index) => value === flag ? [args[index + 1]] : []);
}

test('validation rejects conflicting sides before dependency installation', async t => {
  const context = createContext(t);
  context.options.serverOnly = true;
  context.options.clientOnly = true;
  let installs = 0;
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {
      installs += 1;
    },
  });

  await assert.rejects(provider.validate(), error => {
    assert.equal(error.code, 'METEOR_RSTEST_CONFLICTING_SIDES');
    return true;
  });
  assert.equal(installs, 0);
});

test('pure tests prepare native-only plan with opaque Rspack options', async t => {
  const context = createContext(t);
  const testFile = path.join(
    context.appDir,
    'tests/rstest/pure/server/math.test.js'
  );
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, '');
  const order = [];
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {
      order.push('dependencies');
    },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.deepEqual(order, ['dependencies']);
  assert.equal(plan.mode, 'native-only');
  assert.equal(plan.metadata.runtime, false);
  assert.equal(plan.buildPluginOptions.rspack.lifecycle, 'dependencies-only');
  assert.equal(plan.buildPluginOptions.rspack.context.runtime, false);
  assert.deepEqual(
    argumentValues(provider.nativeArgs, '--architecture'),
    ['os.test', 'web.browser']
  );
});

test('runtime-only selection uses config plan without leaking runtime filters to native Rstest', async t => {
  const context = createContext(t);
  context.architectures = ['os.test', 'web.browser', 'web.browser.legacy'];
  context.options.project = ['meteor-runtime-server'];
  context.options.testFile = ['mongo.test.js'];
  const runtimeFile = path.join(
    context.appDir,
    'tests/rstest/runtime/server/mongo.test.js'
  );
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.writeFileSync(runtimeFile, '');
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(plan.mode, 'meteor-host');
  assert.ok(provider.runtimePlanArgs.includes('--once'));
  assert.ok(provider.runtimePlanArgs.includes('--runtime-plan-output'));
  assert.equal(provider.runtimePlanArgs.includes('--project'), false);
  assert.equal(provider.runtimePlanArgs.includes('--test-file'), false);
  assert.deepEqual(
    argumentValues(provider.runtimePlanArgs, '--architecture'),
    ['os.test', 'web.browser']
  );
});

test('native client project receives one canonical Meteor browser architecture', async t => {
  const context = createContext(t);
  context.architectures = ['os.test', 'web.browser', 'web.browser.legacy'];
  context.webArchs = ['web.browser', 'web.browser.legacy'];
  context.options.project = ['meteor-browser'];
  const browserFile = path.join(context.appDir, 'tests/rstest/browser/dom.test.js');
  fs.mkdirSync(path.dirname(browserFile), { recursive: true });
  fs.writeFileSync(browserFile, '');
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
  });

  await provider.validate();
  await provider.prepare();

  assert.deepEqual(
    argumentValues(provider.nativeArgs, '--architecture'),
    ['web.browser']
  );
});

test('runtime tests prepare Meteor-host plan and package harness first', async t => {
  const order = [];
  const context = createContext(t, {
    command: 'test-packages',
    npm: {
      root: '/harness',
      autoInstall: true,
      async ensureHarnessManifest() {
        order.push('manifest');
      },
    },
  });
  const provider = new RstestTestRunnerProvider(context, {
    scanNativeRstestRoots() {
      return {
        pureFiles: [],
        runtimeFiles: ['package-runtime.test.js'],
        externalFiles: [],
        legacyFiles: [],
      };
    },
    async ensureRstestInstalled() {
      order.push('dependencies');
    },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.deepEqual(order, ['manifest', 'dependencies']);
  assert.equal(plan.mode, 'meteor-host');
  assert.equal(plan.metadata.runtime, true);
  assert.equal(plan.metadata.command, 'test-packages');
});

test('auto-install opt-out never invokes dependency installer', async t => {
  const context = createContext(t, {
    npm: {
      root: '/harness',
      autoInstall: false,
      async ensureHarnessManifest() {},
    },
  });
  let installs = 0;
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {
      installs += 1;
    },
  });

  await provider.validate();
  const plan = await provider.prepare();
  assert.equal(installs, 0);
  assert.equal(plan.buildPluginOptions.rspack.autoInstall, false);
});

test('provider cleanup stops resources once in reverse start order', async t => {
  const calls = [];
  const context = createContext(t);
  const provider = new RstestTestRunnerProvider(context);
  provider.resources.push(
    { async stop() { calls.push('native'); } },
    { async stop() { calls.push('browser'); } },
    { async stop() { calls.push('external'); } },
  );

  await provider.stop();
  await provider.stop();
  assert.deepEqual(calls, ['external', 'browser', 'native']);
});

test('build plugin registers lazy provider without environment install checks', () => {
  const registrations = [];
  const pluginPath = require.resolve('../plugin.js');
  delete require.cache[pluginPath];
  global.Plugin = {
    registerTestRunner(registration, factory) {
      registrations.push({ registration, factory });
    },
  };
  try {
    require(pluginPath);
  } finally {
    delete global.Plugin;
    delete require.cache[pluginPath];
  }

  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0].registration, {
    id: 'rstest',
    apiVersion: 1,
    activationPackages: ['rstest'],
    incompatiblePackages: [{
      name: 'tinytest',
      driverPackage: 'test-in-browser',
    }, {
      name: 'meteortesting:mocha',
      driverPackage: 'meteortesting:mocha',
    }],
  });
  assert.equal(typeof registrations[0].factory, 'function');
});
