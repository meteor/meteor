const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const vm = require('node:vm');

const {
  createPlaywrightCoverageCollector,
} = require('../src/coverage/playwright.js');
const {
  createCoverageFrameGate,
} = require('../../../packages/rstest/runtime/coverage-protocol.js');

const generation = 'abcdef1234567890abcdef1234567890';

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
      `(${callback.toString()})(${JSON.stringify(argument)})`,
      this.browserGlobal,
    );
  }

  async navigate(documentId, coverageMap) {
    const binding = [...this._context.bindings.values()][0];
    assert.equal(typeof binding, 'function', 'navigation requires installed binding');
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
  }

  async addInitScript(callback, argument) {
    this.initScripts.push({ callback, argument });
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
  const collector = createPlaywrightCoverageCollector({ enabled: true });
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
  await additionalPage.close();
  await collector.captureRemaining();

  const merged = collector.mergedCoverage();
  assert.equal(merged['/app/imports/page.js'].s[0], 3);
  assert.equal(merged['/app/imports/popup.js'].s[0], 4);
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
  assert.equal(primary.browser.newContext, originalNewContext);
  assert.equal(primary.context.newPage, originalNewPage);
  assert.equal(primary.page.close, originalClose);
  assert.equal(primary.context.bindings.size, 0);
  assert.equal(primary.context.initScripts.length, 0);
  assert.equal(primary.page.evaluateCalls, 0);
});
