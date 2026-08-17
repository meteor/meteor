const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  cleanupCoverageShardDirectory,
  createBrowserCaptureScripts,
  createPlaywrightCoverageCollector,
  installFixturelessPlaywrightCoverageLifecycle,
  readCoverageShards,
  resolveProjectPlaywrightEntry,
  resolveProjectPlaywrightModuleEntry,
  writeCoverageShard,
} = require('../src/coverage/playwright.js');
const {
  createCoverageFrameGate,
} = require('../../../packages/rstest/runtime/coverage-protocol.js');

const generation = 'abcdef1234567890abcdef1234567890';

test('browser coverage scripts execute without Node closure state', () => {
  const snapshots = [];
  const listeners = {};
  const browserGlobal = {
    __coverage__: coverage('/app/imports/browser-script.js', 6),
    addEventListener(name, callback) { listeners[name] = callback; },
    crypto: { randomUUID: () => 'browser-document' },
    sendCoverage(snapshot) { snapshots.push(snapshot); },
  };
  const scripts = createBrowserCaptureScripts('sendCoverage');

  vm.runInNewContext(scripts.install, browserGlobal);
  listeners.pagehide();
  const current = vm.runInNewContext(scripts.read, browserGlobal);

  assert.equal(snapshots[0].documentId, 'browser-document');
  assert.equal(snapshots[0].coverage['/app/imports/browser-script.js'].s[0], 6);
  assert.equal(current.documentId, 'browser-document');
  assert.equal(current.coverage['/app/imports/browser-script.js'].s[0], 6);
});

test('Playwright setup resolves the project-owned ESM import entry', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-playwright-entry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, 'node_modules', '@rstest', 'playwright');
  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@rstest/playwright',
    type: 'module',
    exports: {
      '.': { import: './dist/index.js' },
      './package.json': { default: './package.json' },
    },
  }));
  fs.writeFileSync(path.join(packageRoot, 'dist', 'index.js'), 'export {};\n');

  assert.equal(
    fs.realpathSync(resolveProjectPlaywrightEntry(root)),
    fs.realpathSync(path.join(packageRoot, 'dist', 'index.js')),
  );
});

test('Playwright setup resolves the project-owned browser module entry', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-playwright-module-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, 'node_modules', 'playwright');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: 'playwright',
    main: './index.js',
  }));
  fs.writeFileSync(path.join(packageRoot, 'index.js'), 'module.exports = {};\n');

  assert.equal(
    fs.realpathSync(resolveProjectPlaywrightModuleEntry(root)),
    fs.realpathSync(path.join(packageRoot, 'index.js')),
  );
});

function fileCoverage(filename, hits) {
  return {
    path: filename,
    statementMap: {
      0: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 8 },
      },
    },
    fnMap: {},
    branchMap: {},
    s: { 0: hits },
    f: {},
    b: {},
  };
}

function coverage(filename, hits) {
  return { [filename]: fileCoverage(filename, hits) };
}

class FakePage extends EventEmitter {
  constructor(context, documentId, coverageMap = {}) {
    super();
    this._context = context;
    this.document = { documentId, coverage: coverageMap };
    this.closed = false;
    this.evaluateCalls = 0;
    this._resetBrowserGlobal();
  }

  context() {
    return this._context;
  }

  isClosed() {
    return this.closed;
  }

  _resetBrowserGlobal() {
    this.browserGlobal = {
      __coverage__: structuredClone(this.document.coverage),
      __meteorRstestCoverageDocumentId: this.document.documentId,
      addEventListener() {},
      crypto: { randomUUID: () => this.document.documentId },
      Date,
      Math,
    };
  }

  async evaluate(callback, argument) {
    this.evaluateCalls += 1;
    if (this.closed) throw new Error('Target page has been closed');
    this.browserGlobal.__coverage__ = structuredClone(this.document.coverage);
    return vm.runInNewContext(
      typeof callback === 'string'
        ? callback
        : `(${callback.toString()})(${JSON.stringify(argument)})`,
      this.browserGlobal,
    );
  }

  async navigate(documentId, coverageMap) {
    const binding = [...this._context.bindings.values()][0];
    assert.equal(typeof binding, 'function', 'navigation requires installed binding');
    assert.equal(this._context.bindings.size, 1, 'navigation requires one current binding');
    assert.equal(this._context.initScripts.length, 1, 'navigation requires init script');
    await binding({ page: this, context: this._context }, structuredClone(this.document));
    this.document = { documentId, coverage: coverageMap };
    this._resetBrowserGlobal();
  }

  async close() {
    this.closed = true;
  }
}

class FakeContext extends EventEmitter {
  constructor(browser, initialPage = null) {
    super();
    this._browser = browser;
    this._pages = initialPage ? [initialPage] : [];
    this.bindings = new Map();
    this.initScripts = [];
    this.closed = false;
  }

  browser() {
    return this._browser;
  }

  pages() {
    return [...this._pages];
  }

  async exposeBinding(name, callback) {
    if (this.bindings.has(name)) throw new Error(`Binding ${name} already exists`);
    this.bindings.set(name, callback);
    const context = this;
    let disposed = false;
    return {
      async dispose() {
        if (disposed) return;
        disposed = true;
        if (context.bindings.get(name) === callback) context.bindings.delete(name);
      },
      async [Symbol.asyncDispose]() {
        await this.dispose();
      },
    };
  }

  async addInitScript(callback, argument) {
    const resource = { callback, argument };
    this.initScripts.push(resource);
    const context = this;
    let disposed = false;
    return {
      async dispose() {
        if (disposed) return;
        disposed = true;
        const index = context.initScripts.indexOf(resource);
        if (index !== -1) context.initScripts.splice(index, 1);
      },
      async [Symbol.asyncDispose]() {
        await this.dispose();
      },
    };
  }

  async newPage(documentId = `document-${this._pages.length + 1}`, coverageMap = {}) {
    const page = new FakePage(this, documentId, coverageMap);
    this._pages.push(page);
    this.emit('page', page);
    return page;
  }

  async close() {
    this.closed = true;
    for (const page of this._pages) page.closed = true;
    this._browser._contexts = this._browser._contexts.filter(
      context => context !== this,
    );
  }
}

class FakeBrowser {
  constructor() {
    this._contexts = [];
  }

  contexts() {
    return [...this._contexts];
  }

  addContext(context) {
    this._contexts.push(context);
  }

  async newContext() {
    const context = new FakeContext(this);
    this._contexts.push(context);
    return context;
  }

  async close() {
    for (const context of this._contexts) {
      context.closed = true;
      for (const page of context.pages()) page.closed = true;
    }
  }
}

class FakeBrowserType {
  constructor() {
    this.calls = [];
  }

  async launch() {
    this.calls.push('launch');
    return new FakeBrowser();
  }

  async connect() {
    this.calls.push('connect');
    return new FakeBrowser();
  }

  async connectOverCDP() {
    this.calls.push('connectOverCDP');
    return new FakeBrowser();
  }
}

function fixture() {
  const browser = new FakeBrowser();
  const context = new FakeContext(browser);
  const page = new FakePage(
    context,
    'primary-document-1',
    coverage('/app/imports/page.js', 1),
  );
  context._pages.push(page);
  browser.addContext(context);
  return { browser, context, page };
}

test('Playwright collector tracks primary and additional pages across navigation and close', async () => {
  const primary = fixture();
  const collector = createPlaywrightCoverageCollector({ enabled: true, generation });
  await collector.install(primary);

  await primary.page.navigate(
    'primary-document-2',
    coverage('/app/imports/page.js', 2),
  );
  const additionalContext = await primary.browser.newContext();
  const additionalPage = await additionalContext.newPage(
    'additional-document-1',
    coverage('/app/imports/popup.js', 4),
  );
  assert.notEqual(additionalPage.close, FakePage.prototype.close);
  await additionalPage.close();
  assert.equal(additionalPage.close, FakePage.prototype.close);
  const evaluateCallsAfterClose = additionalPage.evaluateCalls;
  await collector.captureRemaining();
  assert.equal(additionalPage.evaluateCalls, evaluateCallsAfterClose);

  const merged = collector.mergedCoverage();
  assert.equal(merged['/app/imports/page.js'].s[0], 3);
  assert.equal(merged['/app/imports/popup.js'].s[0], 4);
});

test('Playwright collector retains an open page when close fails', async () => {
  const primary = fixture();
  const failedClose = async () => { throw new Error('close failed'); };
  primary.page.close = failedClose;
  const collector = createPlaywrightCoverageCollector({ enabled: true, generation });
  await collector.install(primary);
  const wrappedClose = primary.page.close;

  await assert.rejects(primary.page.close(), /close failed/);
  assert.equal(primary.page.isClosed(), false);
  assert.equal(primary.page.close, wrappedClose);
  const priorCalls = primary.page.evaluateCalls;
  await collector.captureRemaining();
  assert.ok(primary.page.evaluateCalls > priorCalls);
});

test('Playwright collector replaces repeated cumulative snapshots from one document', async () => {
  const primary = fixture();
  const collector = createPlaywrightCoverageCollector({ enabled: true });
  await collector.install(primary);

  await collector.captureRemaining();
  primary.page.document.coverage = coverage('/app/imports/page.js', 7);
  await collector.captureRemaining();

  assert.equal(collector.mergedCoverage()['/app/imports/page.js'].s[0], 7);
});

test('Playwright collector captures every context before fixture browser close', async () => {
  const primary = fixture();
  const collector = createPlaywrightCoverageCollector({ enabled: true });
  await collector.install(primary);
  primary.page.document.coverage = coverage('/app/imports/browser-close.js', 8);

  await primary.browser.close();

  assert.equal(
    collector.mergedCoverage()['/app/imports/browser-close.js'].s[0],
    8,
  );
});

test('fixtureless lifecycle tracks browsers for direct and extended Playwright tests', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-fixtureless-'));
  const directory = path.join(root, generation, 'e2e-shards');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lifecycle = { afterEach: [], afterAll: [] };
  const directTest = {
    afterEach(callback) { lifecycle.afterEach.push(callback); },
    afterAll(callback) { lifecycle.afterAll.push(callback); },
    extend() { return { ...this, extend: this.extend }; },
  };
  const extendedTest = directTest.extend({ account: async () => {} });
  const browserTypes = [new FakeBrowserType(), new FakeBrowserType(), new FakeBrowserType()];
  const collector = createPlaywrightCoverageCollector({ enabled: true, generation });

  installFixturelessPlaywrightCoverageLifecycle({
    playwright: {
      chromium: browserTypes[0],
      firefox: browserTypes[1],
      webkit: browserTypes[2],
    },
    collector,
    afterEach: extendedTest.afterEach,
    afterAll: extendedTest.afterAll,
    directory,
  });

  assert.deepEqual(lifecycle.afterEach.map(callback => callback.length), [0]);
  assert.deepEqual(lifecycle.afterAll.map(callback => callback.length), [0]);
  for (const browserType of browserTypes) {
    const browser = await browserType.launch();
    const context = await browser.newContext();
    await context.newPage(
      `page-${browserType.calls[0]}`,
      coverage(`/app/imports/${browserType.calls[0]}.js`, 1),
    );
  }
  await lifecycle.afterEach[0]();
  await lifecycle.afterAll[0]();

  const shard = readCoverageShards({ directory, generation });
  assert.equal(shard.shards, 1);
  assert.equal(Object.keys(shard.coverage).length, 1);
  assert.deepEqual(browserTypes.map(type => type.calls), [['launch'], ['launch'], ['launch']]);
});

test('parallel Playwright files write durable shards that merge once', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-e2e-shards-'));
  const directory = path.join(root, generation, 'e2e-shards');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  await Promise.all([
    writeCoverageShard({
      directory,
      generation,
      shardId: '11111111111111111111111111111111',
      coverage: {
        ...coverage('/app/imports/shared.js', 1),
        ...coverage('/app/imports/first-file.js', 2),
      },
    }),
    writeCoverageShard({
      directory,
      generation,
      shardId: '22222222222222222222222222222222',
      coverage: {
        ...coverage('/app/imports/shared.js', 3),
        ...coverage('/app/imports/second-file.js', 4),
      },
    }),
  ]);

  const firstShard = path.join(directory, '11111111111111111111111111111111.json');
  const originalFirstShard = fs.readFileSync(firstShard, 'utf8');
  await assert.rejects(
    writeCoverageShard({
      directory,
      generation,
      shardId: '11111111111111111111111111111111',
      coverage: coverage('/app/imports/replayed.js', 99),
    }),
    /identity was replayed/,
  );
  assert.equal(fs.readFileSync(firstShard, 'utf8'), originalFirstShard);
  await assert.rejects(
    writeCoverageShard({
      directory: path.join(root, 'wrong-generation', 'e2e-shards'),
      generation,
      coverage: {},
    }),
    /shard directory is invalid/,
  );

  const result = readCoverageShards({ directory, generation });
  assert.equal(result.shards, 2);
  assert.equal(result.coverage['/app/imports/shared.js'].s[0], 4);
  assert.equal(result.coverage['/app/imports/first-file.js'].s[0], 2);
  assert.equal(result.coverage['/app/imports/second-file.js'].s[0], 4);
  assert.ok(fs.readdirSync(directory).every(filename => filename.endsWith('.json')));
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.ok(fs.readdirSync(directory).every(filename =>
      (fs.statSync(path.join(directory, filename)).mode & 0o777) === 0o600
    ));
  }

  cleanupCoverageShardDirectory({ directory, generation });
  assert.equal(fs.existsSync(directory), false);
  assert.equal(fs.existsSync(path.dirname(directory)), true);
});

test('Playwright shard publication binds the temporary source inode', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-shard-source-'));
  const directory = path.join(root, generation, 'e2e-shards');
  const shardId = '77777777777777777777777777777777';
  const outputPath = path.join(directory, `${shardId}.json`);
  const originalSpawn = childProcess.spawnSync;
  let swapped = false;
  t.after(() => {
    childProcess.spawnSync = originalSpawn;
    fs.rmSync(root, { recursive: true, force: true });
  });
  childProcess.spawnSync = function patchedSpawn(command, args, options) {
    if (!swapped && path.resolve(options?.cwd || '') === path.resolve(directory)) {
      const temporaryName = args.find(argument =>
        typeof argument === 'string' && argument.endsWith('.tmp')
      );
      assert.ok(temporaryName);
      const temporaryPath = path.join(directory, temporaryName);
      const originalPath = `${temporaryPath}.original`;
      fs.renameSync(temporaryPath, originalPath);
      fs.writeFileSync(temporaryPath, JSON.stringify({ attacker: true }), { mode: 0o600 });
      swapped = true;
      const result = originalSpawn.call(this, command, args, options);
      fs.unlinkSync(temporaryPath);
      fs.renameSync(originalPath, temporaryPath);
      return result;
    }
    return originalSpawn.call(this, command, args, options);
  };

  await assert.rejects(writeCoverageShard({
    directory,
    generation,
    shardId,
    coverage: coverage('/app/imports/source-race.js', 1),
  }), /changed during atomic publication|path changed/i);
  assert.equal(swapped, true);
  assert.equal(fs.existsSync(outputPath), false);
});

test('Playwright shard publication rejects a coordinated parent swap', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-shard-parent-'));
  const directory = path.join(root, generation, 'e2e-shards');
  const movedDirectory = `${directory}-original`;
  const outside = path.join(root, 'outside');
  const shardId = '88888888888888888888888888888888';
  const originalSpawn = childProcess.spawnSync;
  let swapped = false;
  fs.mkdirSync(outside, { recursive: true });
  t.after(() => {
    childProcess.spawnSync = originalSpawn;
    fs.rmSync(root, { recursive: true, force: true });
  });
  childProcess.spawnSync = function patchedSpawn(command, args, options) {
    if (!swapped && path.resolve(options?.cwd || '') === path.resolve(directory)) {
      fs.renameSync(directory, movedDirectory);
      fs.symlinkSync(outside, directory);
      swapped = true;
      const result = originalSpawn.call(this, command, args, options);
      fs.unlinkSync(directory);
      fs.renameSync(movedDirectory, directory);
      return result;
    }
    return originalSpawn.call(this, command, args, options);
  };

  await assert.rejects(writeCoverageShard({
    directory,
    generation,
    shardId,
    coverage: coverage('/app/imports/parent-race.js', 1),
  }), /changed during atomic publication|parent changed/i);
  assert.equal(swapped, true);
  assert.equal(fs.existsSync(path.join(outside, `${shardId}.json`)), false);
});

test('Playwright shard reader rejects a substituted directory', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-shard-read-'));
  const directory = path.join(root, generation, 'e2e-shards');
  const movedDirectory = `${directory}-original`;
  const outside = path.join(root, 'outside');
  const shardId = '99999999999999999999999999999999';
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await writeCoverageShard({
    directory,
    generation,
    shardId,
    coverage: coverage('/app/imports/original.js', 1),
  });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, `${shardId}.json`), JSON.stringify({
    schemaVersion: 1,
    generation,
    producer: 'e2e',
    shardId,
    coverage: coverage('/app/imports/injected.js', 99),
  }));
  const originalReaddir = fs.readdirSync;
  let swapped = false;
  fs.readdirSync = function patchedReaddir(filename, ...args) {
    if (!swapped && path.resolve(String(filename)) === path.resolve(directory)) {
      fs.renameSync(directory, movedDirectory);
      fs.symlinkSync(outside, directory);
      swapped = true;
    }
    return originalReaddir.call(this, filename, ...args);
  };
  t.after(() => {
    fs.readdirSync = originalReaddir;
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
      fs.unlinkSync(directory);
      fs.renameSync(movedDirectory, directory);
    }
  });

  assert.throws(
    () => readCoverageShards({ directory, generation }),
    /identity changed|symbolic-link|symlink/i,
  );
  assert.equal(swapped, true);
});

test('Playwright shard cleanup rejects a substituted directory without deleting it', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-shard-clean-'));
  const directory = path.join(root, generation, 'e2e-shards');
  const movedDirectory = `${directory}-original`;
  const outside = path.join(root, 'outside');
  const shardId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const sentinel = path.join(outside, 'sentinel.txt');
  const originalSpawn = childProcess.spawnSync;
  let swapped = false;
  t.after(() => {
    childProcess.spawnSync = originalSpawn;
    fs.rmSync(root, { recursive: true, force: true });
  });
  await writeCoverageShard({
    directory,
    generation,
    shardId,
    coverage: coverage('/app/imports/cleanup.js', 1),
  });
  fs.mkdirSync(outside);
  fs.writeFileSync(sentinel, 'preserve');
  childProcess.spawnSync = function patchedSpawn(command, args, options) {
    if (!swapped && path.resolve(options?.cwd || '') === path.resolve(directory)) {
      fs.renameSync(directory, movedDirectory);
      fs.symlinkSync(outside, directory);
      swapped = true;
      const result = originalSpawn.call(this, command, args, options);
      fs.unlinkSync(directory);
      fs.renameSync(movedDirectory, directory);
      return result;
    }
    return originalSpawn.call(this, command, args, options);
  };

  assert.throws(
    () => cleanupCoverageShardDirectory({ directory, generation }),
    /changed during safe cleanup|identity changed/i,
  );
  assert.equal(swapped, true);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');
});

test('Playwright shard IO fallback avoids unsupported no-follow directory flags', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-shard-fallback-'));
  const directory = path.join(root, generation, 'e2e-shards');
  const capabilities = { noFollow: false, directory: false };
  const originalOpen = fs.openSync;
  t.after(() => {
    fs.openSync = originalOpen;
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.openSync = function rejectUnsupportedFlags(filename, flags, ...args) {
    if (typeof flags === 'number' && (
      fs.constants.O_NOFOLLOW && (flags & fs.constants.O_NOFOLLOW) !== 0 ||
      fs.constants.O_DIRECTORY && (flags & fs.constants.O_DIRECTORY) !== 0
    )) {
      const error = new Error('simulated unsupported descriptor flag');
      error.code = 'EINVAL';
      throw error;
    }
    return originalOpen.call(this, filename, flags, ...args);
  };

  await writeCoverageShard({
    directory,
    generation,
    shardId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    coverage: coverage('/app/imports/fallback.js', 2),
    fileSystemCapabilities: capabilities,
  });
  const result = readCoverageShards({
    directory,
    generation,
    fileSystemCapabilities: capabilities,
  });
  assert.equal(result.coverage['/app/imports/fallback.js'].s[0], 2);
  cleanupCoverageShardDirectory({
    directory,
    generation,
    fileSystemCapabilities: capabilities,
  });
  assert.equal(fs.existsSync(directory), false);
});

test('sequential Playwright files release shared browser instrumentation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-e2e-worker-'));
  const directory = path.join(root, generation, 'e2e-shards');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = fixture();
  const firstCollector = createPlaywrightCoverageCollector({
    enabled: true,
    generation,
  });
  await firstCollector.install(first);
  await firstCollector.writeShard({
    directory,
    shardId: '33333333333333333333333333333333',
  });
  await first.context.close();

  const secondCollector = createPlaywrightCoverageCollector({
    enabled: true,
    generation,
  });
  await secondCollector.install({ browser: first.browser });
  const secondContext = await first.browser.newContext();
  assert.equal(secondContext.bindings.size, 1);
  const secondPage = await secondContext.newPage(
    'second-file-document',
    coverage('/app/imports/second-worker-file.js', 5),
  );
  await secondCollector.install({
    browser: first.browser,
    context: secondContext,
    page: secondPage,
  });
  await secondCollector.writeShard({
    directory,
    shardId: '44444444444444444444444444444444',
  });

  const merged = readCoverageShards({ directory, generation }).coverage;
  assert.equal(merged['/app/imports/page.js'].s[0], 1);
  assert.equal(merged['/app/imports/second-worker-file.js'].s[0], 5);
});

test('collector teardown restores persistent page and context instrumentation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-e2e-persistent-'));
  const directory = path.join(root, generation, 'e2e-shards');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const persistent = fixture();
  const originalContextNewPage = persistent.context.newPage;
  const originalContextClose = persistent.context.close;
  const originalPageClose = persistent.page.close;

  const firstCollector = createPlaywrightCoverageCollector({ enabled: true, generation });
  await firstCollector.install(persistent);
  await firstCollector.writeShard({
    directory,
    shardId: '55555555555555555555555555555555',
  });

  assert.equal(persistent.context.newPage, originalContextNewPage);
  assert.equal(persistent.context.close, originalContextClose);
  assert.equal(persistent.page.close, originalPageClose);
  assert.equal(persistent.context.listenerCount('page'), 0);
  assert.equal(persistent.context.bindings.size, 0);
  assert.equal(persistent.context.initScripts.length, 0);

  const secondCollector = createPlaywrightCoverageCollector({ enabled: true, generation });
  await secondCollector.install(persistent);
  await persistent.page.navigate(
    'persistent-page-document',
    coverage('/app/imports/persistent-page.js', 7),
  );
  await persistent.context.newPage(
    'persistent-page-child',
    coverage('/app/imports/persistent-child.js', 5),
  );
  await secondCollector.captureRemaining();

  assert.equal(firstCollector.mergedCoverage()['/app/imports/page.js'].s[0], 1);
  assert.equal(
    firstCollector.mergedCoverage()['/app/imports/persistent-page.js'],
    undefined,
  );
  assert.equal(
    secondCollector.mergedCoverage()['/app/imports/persistent-page.js'].s[0],
    7,
  );
  assert.equal(
    secondCollector.mergedCoverage()['/app/imports/persistent-child.js'].s[0],
    5,
  );
  await secondCollector.writeShard({
    directory,
    shardId: '66666666666666666666666666666666',
  });
  assert.equal(persistent.context.listenerCount('page'), 0);
});

test('Playwright collector submits one authenticated committed e2e artifact', async () => {
  const primary = fixture();
  const requests = [];
  const receiver = createCoverageFrameGate({
    generation,
    token: 'secret-token',
    producer: 'e2e',
  });
  let committedArtifact;
  const collector = createPlaywrightCoverageCollector({
    enabled: true,
    generation,
    token: 'secret-token',
    producer: 'e2e',
    baseUrl: 'http://localhost:3100/nested/app/',
    async fetch(url, options) {
      requests.push({ url, options });
      const accepted = receiver.submit(JSON.parse(options.body));
      if (accepted.committed) committedArtifact = receiver.commit();
      return { ok: true, status: 200 };
    },
  });
  await collector.install(primary);

  await collector.submit();

  const frames = requests.map(request => JSON.parse(request.options.body));
  assert.deepEqual(frames.map(frame => frame.type), ['begin', 'chunk', 'commit']);
  assert.ok(frames.every(frame => frame.producer === 'e2e'));
  assert.ok(frames.every(frame => frame.generation === generation));
  assert.ok(requests.every(request =>
    request.url === 'http://localhost:3100/nested/app/__meteor__/rstest/coverage'
  ));
  assert.ok(requests.every(request =>
    request.options.headers['x-meteor-rstest-token'] === 'secret-token'
  ));
  assert.equal(committedArtifact.coverage['/app/imports/page.js'].s[0], 1);
});

test('disabled Playwright coverage installs and submits nothing', async () => {
  const primary = fixture();
  const originalNewContext = primary.browser.newContext;
  const originalBrowserClose = primary.browser.close;
  const originalNewPage = primary.context.newPage;
  const originalClose = primary.page.close;
  const collector = createPlaywrightCoverageCollector({
    enabled: false,
    async fetch() {
      throw new Error('disabled collector must not fetch');
    },
  });

  assert.deepEqual(await collector.install(primary), { installed: false });
  assert.deepEqual(await collector.submit(), { submitted: false });
  assert.deepEqual(await collector.writeShard({ directory: '/must-not-exist' }), {
    written: false,
  });
  assert.equal(primary.browser.newContext, originalNewContext);
  assert.equal(primary.browser.close, originalBrowserClose);
  assert.equal(primary.context.newPage, originalNewPage);
  assert.equal(primary.page.close, originalClose);
  assert.equal(primary.context.bindings.size, 0);
  assert.equal(primary.context.initScripts.length, 0);
  assert.equal(primary.page.evaluateCalls, 0);
});
