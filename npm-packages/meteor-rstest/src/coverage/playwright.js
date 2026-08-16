const { createRequire } = require('node:module');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const coverageProviderRequire = createRequire(
  require.resolve('@rstest/coverage-istanbul'),
);
const { createCoverageMap } = coverageProviderRequire('istanbul-lib-coverage');

const COVERAGE_CHUNK_BYTES = 128 * 1024;
const MAX_COVERAGE_BYTES = 64 * 1024 * 1024;
const GENERATION_PATTERN = /^[a-f0-9]{32,128}$/i;
const PRODUCER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHARD_ID_PATTERN = /^[a-f0-9]{32}$/;
const browserTypeInterceptions = new WeakMap();

function coverageError(message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = 'METEOR_RSTEST_PLAYWRIGHT_COVERAGE';
  return error;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveProjectPlaywrightEntry(projectRoot) {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  const packageJsonPath = projectRequire.resolve('@rstest/playwright/package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const rootExport = packageJson.exports && packageJson.exports['.'];
  const importEntry = typeof rootExport === 'string'
    ? rootExport
    : rootExport && rootExport.import;
  if (typeof importEntry !== 'string') {
    throw coverageError(
      'Project-owned @rstest/playwright does not expose an ESM import entry.',
    );
  }
  return path.resolve(path.dirname(packageJsonPath), importEntry);
}

function resolveProjectPlaywrightModuleEntry(projectRoot) {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  try {
    return projectRequire.resolve('playwright');
  } catch {
    throw coverageError('Project-owned playwright browser module is unavailable.');
  }
}

function installFixturelessPlaywrightCoverageLifecycle({
  playwright,
  collector,
  afterEach,
  afterAll,
  directory,
}) {
  if (!collector || typeof collector.install !== 'function' ||
      typeof collector.captureRemaining !== 'function' ||
      typeof collector.writeShard !== 'function' ||
      typeof afterEach !== 'function' || typeof afterAll !== 'function') {
    throw coverageError('Playwright coverage lifecycle is invalid.');
  }
  const restore = interceptPlaywrightBrowserTypes({ playwright, collector });
  afterEach(async () => {
    await collector.captureRemaining();
  });
  afterAll(async () => {
    try {
      await collector.writeShard({ directory });
    } finally {
      restore();
    }
  });
  return restore;
}

function interceptPlaywrightBrowserTypes({ playwright, collector }) {
  if (!playwright || (typeof playwright !== 'object' &&
      typeof playwright !== 'function')) {
    throw coverageError('Project-owned playwright browser module is invalid.');
  }
  const methods = ['launch', 'connect', 'connectOverCDP', 'launchPersistentContext'];
  const browserTypes = [...new Set(['chromium', 'firefox', 'webkit'].map(name =>
    playwright[name]
  ).filter(value => value && (typeof value === 'object' || typeof value === 'function')))];
  const patches = [];
  for (const browserType of browserTypes) {
    const existing = browserTypeInterceptions.get(browserType);
    if (existing) {
      if (existing.collector !== collector) {
        throw coverageError('Playwright browser coverage interception is already active.');
      }
      continue;
    }
    for (const method of methods) {
      if (typeof browserType[method] === 'function') {
        patches.push({ browserType, method, original: browserType[method] });
      }
    }
  }
  const restoration = () => {
    for (const patch of patches) {
      if (patch.browserType[patch.method] === patch.wrapped) {
        patch.browserType[patch.method] = patch.original;
      }
      if (browserTypeInterceptions.get(patch.browserType) === state) {
        browserTypeInterceptions.delete(patch.browserType);
      }
    }
  };
  const state = { collector, restoration };
  for (const patch of patches) {
    patch.wrapped = async function meteorRstestCoverageBrowserTypeMethod(...args) {
      const result = await Reflect.apply(patch.original, this, args);
      if (patch.method === 'launchPersistentContext') {
        const browser = result && typeof result.browser === 'function'
          ? result.browser()
          : undefined;
        await collector.install({ browser, context: result });
      } else {
        await collector.install({ browser: result });
      }
      return result;
    };
    patch.browserType[patch.method] = patch.wrapped;
    browserTypeInterceptions.set(patch.browserType, state);
  }
  return restoration;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertNoSymlinkComponents(filename, { allowMissing = false } = {}) {
  const absolute = path.resolve(filename);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      if (path.dirname(current) === parsed.root) {
        current = fs.realpathSync(current);
        continue;
      }
      throw coverageError(`Coverage shard path contains a symlink: ${current}.`);
    }
  }
}

function assertShardDirectory({ directory, generation }) {
  if (!path.isAbsolute(directory || '') ||
      !GENERATION_PATTERN.test(generation || '') ||
      path.basename(directory) !== 'e2e-shards' ||
      path.basename(path.dirname(directory)) !== generation) {
    throw coverageError('Playwright coverage shard directory is invalid.');
  }
}

function createShardDirectory({ directory, generation }) {
  assertShardDirectory({ directory, generation });
  assertNoSymlinkComponents(directory, { allowMissing: true });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertNoSymlinkComponents(directory);
  fs.chmodSync(directory, 0o700);
}

async function writeCoverageShard({
  directory,
  generation,
  coverage,
  shardId = crypto.randomBytes(16).toString('hex'),
}) {
  createShardDirectory({ directory, generation });
  if (!SHARD_ID_PATTERN.test(shardId || '')) {
    throw coverageError('Playwright coverage shard identity is invalid.');
  }
  const normalized = createCoverageMap(cloneJson(coverage)).toJSON();
  const artifact = {
    schemaVersion: 1,
    generation,
    producer: 'e2e',
    shardId,
    coverage: normalized,
  };
  const serialized = JSON.stringify(artifact);
  if (Buffer.byteLength(serialized) > MAX_COVERAGE_BYTES) {
    throw coverageError('Playwright coverage shard exceeds the 64 MiB limit.');
  }
  const outputPath = path.join(directory, `${shardId}.json`);
  const temporaryPath = path.join(
    directory,
    `.${shardId}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  let descriptor;
  try {
    let flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL;
    if (Number.isInteger(fs.constants.O_NOFOLLOW) && fs.constants.O_NOFOLLOW) {
      flags |= fs.constants.O_NOFOLLOW;
    }
    descriptor = fs.openSync(temporaryPath, flags, 0o600);
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, 0o600);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertNoSymlinkComponents(directory);
    try {
      fs.linkSync(temporaryPath, outputPath);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw coverageError('Playwright coverage shard identity was replayed.');
      }
      throw error;
    }
    fs.unlinkSync(temporaryPath);
    const directoryDescriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporaryPath); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { written: true, path: outputPath, shardId };
}

function readCoverageShards({ directory, generation }) {
  assertShardDirectory({ directory, generation });
  assertNoSymlinkComponents(directory);
  const merged = createCoverageMap({});
  let shards = 0;
  for (const filename of fs.readdirSync(directory).sort()) {
    const match = /^([a-f0-9]{32})\.json$/.exec(filename);
    if (!match) throw coverageError('Playwright coverage shard filename is invalid.');
    const shardId = match[1];
    const filePath = path.join(directory, filename);
    let flags = fs.constants.O_RDONLY;
    if (Number.isInteger(fs.constants.O_NOFOLLOW) && fs.constants.O_NOFOLLOW) {
      flags |= fs.constants.O_NOFOLLOW;
    }
    const descriptor = fs.openSync(filePath, flags);
    try {
      const opened = fs.fstatSync(descriptor, { bigint: true });
      if (!opened.isFile() || opened.size > BigInt(MAX_COVERAGE_BYTES)) {
        throw coverageError('Playwright coverage shard is not a bounded regular file.');
      }
      const serialized = fs.readFileSync(descriptor, 'utf8');
      const current = fs.lstatSync(filePath, { bigint: true });
      if (current.isSymbolicLink() || !current.isFile() ||
          !sameIdentity(opened, current)) {
        throw coverageError('Playwright coverage shard changed while being read.');
      }
      let artifact;
      try { artifact = JSON.parse(serialized); } catch {
        throw coverageError('Playwright coverage shard is not valid JSON.');
      }
      if (!artifact || artifact.schemaVersion !== 1 ||
          artifact.generation !== generation || artifact.producer !== 'e2e' ||
          artifact.shardId !== shardId) {
        throw coverageError('Playwright coverage shard schema is invalid or stale.');
      }
      merged.merge(createCoverageMap(artifact.coverage));
      shards += 1;
    } finally {
      fs.closeSync(descriptor);
    }
  }
  if (shards === 0) {
    throw coverageError('External Rstest produced no Playwright coverage shards.');
  }
  return { coverage: merged.toJSON(), shards };
}

function cleanupCoverageShardDirectory({ directory, generation }) {
  assertShardDirectory({ directory, generation });
  if (!fs.existsSync(directory)) return;
  assertNoSymlinkComponents(directory);
  for (const filename of fs.readdirSync(directory)) {
    const filePath = path.join(directory, filename);
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) {
      throw coverageError('Playwright coverage shard directory contains a nested directory.');
    }
    fs.unlinkSync(filePath);
  }
  fs.rmdirSync(directory);
}

function createBrowserCaptureScripts(bindingName) {
  const install = `(() => {
  const bindingName = ${JSON.stringify(bindingName)};
  const documentIdKey = '__meteorRstestCoverageDocumentId';
  const captureInstalledKey = '__meteorRstestCoverageCaptureInstalled';
  if (!globalThis[documentIdKey]) {
    const random = globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : String(Date.now()) + '-' + String(Math.random());
    Object.defineProperty(globalThis, documentIdKey, {
      configurable: false,
      enumerable: false,
      value: random,
    });
  }
  if (globalThis[captureInstalledKey]) return;
  Object.defineProperty(globalThis, captureInstalledKey, {
    configurable: false,
    enumerable: false,
    value: true,
  });
  const capture = () => globalThis[bindingName]({
    documentId: globalThis[documentIdKey],
    coverage: globalThis.__coverage__ || {},
  });
  globalThis.addEventListener('pagehide', capture, { capture: true });
  globalThis.addEventListener('beforeunload', capture, { capture: true });
})()`;

  const read = `(() => {
  return {
    documentId: globalThis.__meteorRstestCoverageDocumentId,
    coverage: globalThis.__coverage__ || {},
  };
})()`;
  return { install, read };
}

function serializeCoverageFrames({ generation, token, producer, coverage }) {
  if (!GENERATION_PATTERN.test(generation || '') ||
      !PRODUCER_PATTERN.test(producer || '') ||
      typeof token !== 'string' || token.length === 0 || token.length > 512) {
    throw coverageError('Playwright coverage identity is invalid.');
  }
  const artifact = {
    schemaVersion: 1,
    generation,
    producer,
    coverage,
  };
  const bytes = Buffer.from(JSON.stringify(artifact));
  if (bytes.byteLength > MAX_COVERAGE_BYTES) {
    throw coverageError('Playwright coverage artifact exceeds the 64 MiB limit.');
  }
  const chunks = [];
  for (let offset = 0; offset < bytes.byteLength; offset += COVERAGE_CHUNK_BYTES) {
    chunks.push(bytes.subarray(offset, offset + COVERAGE_CHUNK_BYTES).toString('base64'));
  }
  const common = { protocolVersion: 1, generation, token, producer };
  return [
    { ...common, type: 'begin', size: bytes.byteLength, chunks: chunks.length },
    ...chunks.map((data, sequence) => ({
      ...common,
      type: 'chunk',
      sequence,
      data,
    })),
    { ...common, type: 'commit', size: bytes.byteLength, chunks: chunks.length },
  ];
}

async function responseMessage(response) {
  try {
    const payload = await response.json();
    if (payload && typeof payload.error === 'string') return payload.error;
  } catch {}
  return `HTTP ${response && response.status}`;
}

function coverageEndpoint(baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw coverageError('Playwright coverage base URL is invalid.');
  }
  base.pathname = `${base.pathname.replace(/\/$/, '')}/`;
  return new URL('__meteor__/rstest/coverage', base);
}

function createPlaywrightCoverageCollector({
  enabled = false,
  generation,
  token,
  producer = 'e2e',
  baseUrl,
  fetch: fetchImpl = global.fetch,
} = {}) {
  const trackedBrowsers = new WeakSet();
  const browserRestorations = new Map();
  const trackedContexts = new WeakSet();
  const trackedPages = new Set();
  const pageTracking = new WeakMap();
  const pendingTracking = new Set();
  const trackingErrors = [];
  const pageIds = new WeakMap();
  const snapshots = new Map();
  let nextPageId = 1;
  let submitPromise;
  let shardPromise;
  const bindingName = `__meteorRstestCoverage_${String(generation || 'collector')}_` +
    crypto.randomBytes(8).toString('hex');
  const browserScripts = createBrowserCaptureScripts(bindingName);

  function releaseBrowserInstrumentation() {
    for (const [browser, restoration] of browserRestorations) {
      if (browser.newContext === restoration.wrappedNewContext) {
        browser.newContext = restoration.originalNewContext;
      }
      if (browser.close === restoration.wrappedClose) {
        browser.close = restoration.originalClose;
      }
    }
    browserRestorations.clear();
  }

  function pageId(page) {
    if (!pageIds.has(page)) pageIds.set(page, nextPageId++);
    return pageIds.get(page);
  }

  function recordSnapshot(page, snapshot) {
    if (!snapshot || typeof snapshot.documentId !== 'string' ||
        !snapshot.documentId || !snapshot.coverage ||
        typeof snapshot.coverage !== 'object' || Array.isArray(snapshot.coverage)) {
      throw coverageError('Playwright page returned an invalid Istanbul snapshot.');
    }
    const map = createCoverageMap(cloneJson(snapshot.coverage));
    snapshots.set(`${pageId(page)}:${snapshot.documentId}`, map.toJSON());
  }

  async function capturePage(page) {
    if (!enabled || !page || typeof page.evaluate !== 'function' ||
        typeof page.isClosed === 'function' && page.isClosed()) {
      return { captured: false };
    }
    const snapshot = await page.evaluate(browserScripts.read);
    recordSnapshot(page, snapshot);
    return { captured: true };
  }

  async function trackPage(page) {
    if (!page) return;
    if (!pageTracking.has(page)) {
      pageTracking.set(page, (async () => {
        trackedPages.add(page);
        pageId(page);
        const originalClose = page.close;
        if (typeof originalClose === 'function') {
          page.close = async function meteorRstestCoveragePageClose(...args) {
            await capturePage(page);
            return Reflect.apply(originalClose, this, args);
          };
        }
        if (typeof page.evaluate === 'function' &&
            !(typeof page.isClosed === 'function' && page.isClosed())) {
          await page.evaluate(browserScripts.install);
        }
      })());
    }
    return pageTracking.get(page);
  }

  async function trackContext(context) {
    if (!context || trackedContexts.has(context)) return;
    trackedContexts.add(context);
    await context.exposeBinding(bindingName, (source, snapshot) => {
      const page = source && source.page;
      if (!page) throw coverageError('Playwright coverage binding omitted its page.');
      recordSnapshot(page, snapshot);
    });
    await context.addInitScript(browserScripts.install);

    const originalNewPage = context.newPage;
    if (typeof originalNewPage === 'function') {
      context.newPage = async function meteorRstestCoverageNewPage(...args) {
        const page = await Reflect.apply(originalNewPage, this, args);
        await trackPage(page);
        return page;
      };
    }
    const originalClose = context.close;
    if (typeof originalClose === 'function') {
      context.close = async function meteorRstestCoverageContextClose(...args) {
        for (const page of context.pages()) await capturePage(page);
        return Reflect.apply(originalClose, this, args);
      };
    }
    if (typeof context.on === 'function') {
      context.on('page', page => {
        const tracking = trackPage(page);
        pendingTracking.add(tracking);
        tracking.then(
          () => pendingTracking.delete(tracking),
          error => {
            pendingTracking.delete(tracking);
            trackingErrors.push(error);
          },
        );
      });
    }
    for (const page of context.pages()) await trackPage(page);
  }

  async function trackBrowser(browser) {
    if (!browser || trackedBrowsers.has(browser)) return;
    trackedBrowsers.add(browser);
    const originalNewContext = browser.newContext;
    let wrappedNewContext;
    if (typeof originalNewContext === 'function') {
      wrappedNewContext = async function meteorRstestCoverageNewContext(...args) {
        const context = await Reflect.apply(originalNewContext, this, args);
        await trackContext(context);
        return context;
      };
      browser.newContext = wrappedNewContext;
    }
    const originalClose = browser.close;
    let wrappedClose;
    if (typeof originalClose === 'function') {
      wrappedClose = async function meteorRstestCoverageBrowserClose(...args) {
        for (const context of browser.contexts()) {
          for (const page of context.pages()) await capturePage(page);
        }
        return Reflect.apply(originalClose, this, args);
      };
      browser.close = wrappedClose;
    }
    browserRestorations.set(browser, {
      originalClose,
      originalNewContext,
      wrappedClose,
      wrappedNewContext,
    });
    for (const context of browser.contexts()) await trackContext(context);
  }

  async function install({ browser, context, page } = {}) {
    if (!enabled) return { installed: false };
    await trackBrowser(browser);
    await trackContext(context);
    await trackPage(page);
    return { installed: true };
  }

  async function captureRemaining() {
    if (!enabled) return { captured: false };
    await Promise.all([...pendingTracking]);
    if (trackingErrors.length > 0) {
      throw new AggregateError(
        trackingErrors.splice(0),
        '[Meteor Rstest] Failed to install Playwright page coverage capture.',
      );
    }
    for (const page of trackedPages) await capturePage(page);
    return { captured: true };
  }

  function mergedCoverage() {
    const merged = createCoverageMap({});
    for (const snapshot of snapshots.values()) merged.merge(snapshot);
    return merged.toJSON();
  }

  async function submit() {
    if (!enabled) return { submitted: false };
    if (!submitPromise) submitPromise = (async () => {
      try {
        if (typeof fetchImpl !== 'function') {
          throw coverageError('Playwright coverage upload requires fetch.');
        }
        await captureRemaining();
        const endpoint = coverageEndpoint(baseUrl);
        const frames = serializeCoverageFrames({
          generation,
          token,
          producer,
          coverage: mergedCoverage(),
        });
        for (const frame of frames) {
          const response = await fetchImpl(endpoint.href, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'origin': endpoint.origin,
              'x-meteor-rstest-token': token,
            },
            body: JSON.stringify(frame),
          });
          if (!response || !response.ok) {
            throw coverageError(
              `Playwright coverage upload was rejected: ${await responseMessage(response)}.`,
            );
          }
        }
        return { submitted: true };
      } finally {
        releaseBrowserInstrumentation();
      }
    })();
    return submitPromise;
  }

  async function writeShard({ directory, shardId } = {}) {
    if (!enabled) return { written: false };
    if (!shardPromise) shardPromise = (async () => {
      try {
        await captureRemaining();
        return await writeCoverageShard({
          directory,
          generation,
          coverage: mergedCoverage(),
          ...(shardId ? { shardId } : {}),
        });
      } finally {
        releaseBrowserInstrumentation();
      }
    })();
    return shardPromise;
  }

  return {
    captureRemaining,
    install,
    mergedCoverage,
    submit,
    writeShard,
  };
}

module.exports = {
  cleanupCoverageShardDirectory,
  createBrowserCaptureScripts,
  createPlaywrightCoverageCollector,
  installFixturelessPlaywrightCoverageLifecycle,
  interceptPlaywrightBrowserTypes,
  readCoverageShards,
  resolveProjectPlaywrightEntry,
  resolveProjectPlaywrightModuleEntry,
  writeCoverageShard,
};
