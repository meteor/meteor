const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createMeteorRstestContext } = require('../src/config/context.js');
const {
  finalizeRstestConfig,
  runMeteorRstest,
} = require('../src/coordinator.js');

function createFixture(source) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-'));
  const root = path.join(appRoot, 'tests/rstest/pure/server');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'math.test.js'), source);
  return appRoot;
}

test('coordinator runs pure tests with real Rstest and Rspack', async t => {
  const appRoot = createFixture(`
    test('adds with Rspack', () => {
      expect(20 + 22).toBe(42);
    });
  `);
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const result = await runMeteorRstest({
    context: createMeteorRstestContext({ appRoot, once: true }),
    inlineConfig: { globals: true },
  });

  assert.equal(result.ok, true, JSON.stringify(result.unhandledErrors, null, 2));
  assert.deepEqual(result.stats.tests, {
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    todo: 0,
  });
});

test('coordinator projection supports Meteor defines, CSS, and static assets', async t => {
  const appRoot = createFixture(`
    import './fixture.css';
    import logo from './fixture.svg';
    test('shared app language projection', () => {
      expect(Meteor.isServer).toBe(true);
      expect(typeof logo).toBe('string');
    });
  `);
  const root = path.join(appRoot, 'tests/rstest/pure/server');
  fs.writeFileSync(path.join(root, 'fixture.css'), '.fixture { color: red; }');
  fs.writeFileSync(path.join(root, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const result = await runMeteorRstest({
    context: createMeteorRstestContext({ appRoot, once: true }),
    inlineConfig: { globals: true },
  });

  assert.equal(result.ok, true, JSON.stringify(result.unhandledErrors, null, 2));
});

test('coordinator composes compatible user Rspack tools after Meteor projection', async t => {
  const appRoot = createFixture(`
    import value from 'domain-value';
    test('custom Rspack alias', () => expect(value).toBe(42));
  `);
  const mockPath = path.join(appRoot, 'domain-value.js');
  fs.writeFileSync(mockPath, 'export default 42;');
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const result = await runMeteorRstest({
    context: createMeteorRstestContext({ appRoot, once: true }),
    inlineConfig: {
      globals: true,
      tools: { rspack: { resolve: { alias: { 'domain-value': mockPath } } } },
    },
  });

  assert.equal(result.ok, true, JSON.stringify(result.unhandledErrors, null, 2));
});

test('coordinator forwards Rstest name filtering and structured failures', async t => {
  const appRoot = createFixture(`
    test('selected case', () => expect(true).toBe(false));
    test('unselected case', () => expect(true).toBe(true));
  `);
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const result = await runMeteorRstest({
    context: createMeteorRstestContext({ appRoot, once: true }),
    inlineConfig: { globals: true },
    testNamePattern: '^selected case$',
  });

  assert.equal(result.ok, false);
  assert.equal(result.stats.tests.failed, 1);
  assert.equal(result.stats.tests.passed, 0);
  assert.equal(result.files[0].results[0].name, 'selected case');
});

test('coordinator generates opt-in real-browser project from browser root', async t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-browser-'));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(appRoot, 'tests/rstest/browser'), { recursive: true });

  const config = await finalizeRstestConfig({
    context: createMeteorRstestContext({ appRoot, once: true, ci: true }),
    userConfig: { globals: true },
  });
  const project = config.projects.find(item => item.name === 'meteor-browser');

  assert.ok(project);
  assert.equal(project.browser.enabled, true);
  assert.equal(project.browser.provider, 'playwright');
  assert.equal(project.browser.browser, 'chromium');
  assert.equal(project.browser.headless, true);
  assert.equal(project.testEnvironment, undefined);
});

test('coordinator constrains generated projects to requested Meteor side', async t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-sides-'));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  for (const root of ['pure/server', 'pure/client', 'browser']) {
    fs.mkdirSync(path.join(appRoot, 'tests/rstest', root), { recursive: true });
  }

  const serverConfig = await finalizeRstestConfig({
    context: createMeteorRstestContext({
      appRoot,
      once: true,
      server: true,
      client: false,
    }),
  });
  assert.deepEqual(serverConfig.projects.map(project => project.name), [
    'meteor-pure-server',
  ]);

  const clientConfig = await finalizeRstestConfig({
    context: createMeteorRstestContext({
      appRoot,
      once: true,
      server: false,
      client: true,
    }),
  });
  assert.deepEqual(clientConfig.projects.map(project => project.name), [
    'meteor-pure-client',
    'meteor-browser',
  ]);
});

test('coordinator rejects direct Meteor imports from pure project discovery', async t => {
  const appRoot = createFixture(`
    import { Mongo } from 'meteor/mongo';
    test('invalid pure test', () => expect(Mongo).toBeDefined());
  `);
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  await assert.rejects(() => finalizeRstestConfig({
    context: createMeteorRstestContext({ appRoot, once: true }),
  }), error => {
    assert.equal(error.code, 'RSTEST_RUNTIME_PROJECT_REQUIRED');
    assert.match(error.message, /tests\/rstest\/runtime\/server/);
    return true;
  });
});

test('coordinator rejects project and root forms that bypass Meteor ownership', async t => {
  const appRoot = createFixture(`test('works', () => expect(true).toBe(true));`);
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  const context = createMeteorRstestContext({ appRoot, once: true });

  await assert.rejects(() => finalizeRstestConfig({
    context,
    userConfig: { projects: ['./nested.config.js'] },
  }), /cannot be ownership-validated/);
  await assert.rejects(() => finalizeRstestConfig({
    context,
    userConfig: { root: path.join(appRoot, 'nested') },
  }), /conflicts with Meteor app root/);
  await assert.rejects(() => finalizeRstestConfig({
    context,
    userConfig: {
      projects: [{
        name: 'overlapping-project',
        root: path.join(appRoot, 'tests/rstest/pure'),
      }],
    },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_PROJECT_ROOT_CONFLICT');
    return true;
  });
  await assert.rejects(() => finalizeRstestConfig({
    context,
    userConfig: { projects: [{ name: 'implicit-app-root' }] },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_PROJECT_ROOT_CONFLICT');
    return true;
  });
});
