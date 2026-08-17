const { createRequire } = require('node:module');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  cleanupCoverageFilesDirectory,
  pinCoverageDirectory,
  readCoverageArtifact,
  writeCoverageArtifact,
} = require('./artifact.js');

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

function assertShardDirectory({ directory, generation }) {
  if (!path.isAbsolute(directory || '') ||
      !GENERATION_PATTERN.test(generation || '') ||
      path.basename(directory) !== 'e2e-shards' ||
      path.basename(path.dirname(directory)) !== generation) {
    throw coverageError('Playwright coverage shard directory is invalid.');
  }
}

async function writeCoverageShard({
  directory,
  generation,
  coverage,
  shardId = crypto.randomBytes(16).toString('hex'),
  fileSystemCapabilities,
}) {
  assertShardDirectory({ directory, generation });
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
  const outputPath = path.join(directory, `${shardId}.json`);
  try {
    writeCoverageArtifact({
      outputPath,
      expectedPath: outputPath,
      artifact,
      fileSystemCapabilities,
    });
  } catch (error) {
    if (error.code === 'METEOR_RSTEST_COVERAGE_REPLAY') {
      throw coverageError('Playwright coverage shard identity was replayed.');
    }
    throw error;
  }
  return { written: true, path: outputPath, shardId };
}

function readCoverageShards({
  directory,
  generation,
  fileSystemCapabilities,
}) {
  assertShardDirectory({ directory, generation });
  const pinned = pinCoverageDirectory({ directory, fileSystemCapabilities });
  const merged = createCoverageMap({});
  let shards = 0;
  try {
    const filenames = fs.readdirSync(directory).sort();
    pinned.verify();
    const consumed = new Set();
    for (const filename of filenames) {
      const match = /^([a-f0-9]{32})\.json$/.exec(filename);
      if (!match) {
        throw coverageError('Playwright coverage shard filename is invalid.');
      }
      const shardId = match[1];
      const filePath = path.join(directory, filename);
      const artifact = readCoverageArtifact({
        filePath,
        expectedPath: filePath,
        generation,
        producer: 'e2e',
        consumed,
        fileSystemCapabilities,
        expectedParentStat: pinned.stat,
      });
      if (artifact.shardId !== shardId) {
        throw coverageError('Playwright coverage shard schema is invalid or stale.');
      }
      merged.merge(artifact.coverage);
      shards += 1;
      pinned.verify();
    }
  } finally {
    pinned.close();
  }
  if (shards === 0) {
    throw coverageError('External Rstest produced no Playwright coverage shards.');
  }
  return { coverage: merged.toJSON(), shards };
}

function cleanupCoverageShardDirectory({
  directory,
  generation,
  fileSystemCapabilities,
}) {
  assertShardDirectory({ directory, generation });
  return cleanupCoverageFilesDirectory({
    directory,
    entryPattern: /^[a-f0-9]{32}\.json$/,
    fileSystemCapabilities,
  });
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
  const contextRestorations = new Map();
  const trackedPages = new Set();
  const pageRestorations = new Map();
  const pageTracking = new WeakMap();
  const pendingTracking = new Set();
  const trackingErrors = [];
  const pageIds = new WeakMap();
  const snapshots = new Map();
  let nextPageId = 1;
  let submitPromise;
  let shardPromise;
  let releasePromise;
  const bindingName = `__meteorRstestCoverage_${String(generation || 'collector')}_` +
    crypto.randomBytes(8).toString('hex');
  const browserScripts = createBrowserCaptureScripts(bindingName);

  async function disposePlaywrightResources(resources) {
    const errors = [];
    for (const resource of resources) {
      if (!resource) continue;
      try {
        if (typeof resource.dispose === 'function') {
          await resource.dispose();
        } else if (typeof Symbol.asyncDispose === 'symbol' &&
                   typeof resource[Symbol.asyncDispose] === 'function') {
          await resource[Symbol.asyncDispose]();
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        '[Meteor Rstest] Failed to dispose Playwright coverage resources.',
      );
    }
  }

  function releaseBrowserInstrumentation() {
    if (releasePromise) return releasePromise;
    releasePromise = (async () => {
      const disposableResources = [];
      for (const [page, restoration] of pageRestorations) {
        if (page.close === restoration.wrappedClose) {
          page.close = restoration.originalClose;
        }
      }
      pageRestorations.clear();
      for (const [context, restoration] of contextRestorations) {
        if (context.newPage === restoration.wrappedNewPage) {
          context.newPage = restoration.originalNewPage;
        }
        if (context.close === restoration.wrappedClose) {
          context.close = restoration.originalClose;
        }
        if (restoration.pageListener) {
          if (typeof context.off === 'function') {
            context.off('page', restoration.pageListener);
          } else if (typeof context.removeListener === 'function') {
            context.removeListener('page', restoration.pageListener);
          }
        }
        disposableResources.push(
          restoration.initScriptDisposable,
          restoration.bindingDisposable,
        );
      }
      contextRestorations.clear();
      for (const [browser, restoration] of browserRestorations) {
        if (browser.newContext === restoration.wrappedNewContext) {
          browser.newContext = restoration.originalNewContext;
        }
        if (browser.close === restoration.wrappedClose) {
          browser.close = restoration.originalClose;
        }
      }
      browserRestorations.clear();
      trackedPages.clear();
      pendingTracking.clear();
      trackingErrors.length = 0;
      await disposePlaywrightResources(disposableResources);
    })();
    return releasePromise;
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

  function releasePageInstrumentation(page) {
    const restoration = pageRestorations.get(page);
    if (restoration && page.close === restoration.wrappedClose) {
      page.close = restoration.originalClose;
    }
    pageRestorations.delete(page);
    trackedPages.delete(page);
    pageTracking.delete(page);
  }

  function releasePageAfterClose(page, closeCompleted) {
    if (closeCompleted ||
        typeof page.isClosed === 'function' && page.isClosed()) {
      releasePageInstrumentation(page);
    }
  }

  async function trackPage(page) {
    if (!page) return;
    if (!pageTracking.has(page)) {
      pageTracking.set(page, (async () => {
        trackedPages.add(page);
        pageId(page);
        const originalClose = page.close;
        let wrappedClose;
        if (typeof originalClose === 'function') {
          wrappedClose = async function meteorRstestCoveragePageClose(...args) {
            let closeCompleted = false;
            try {
              await capturePage(page);
              const result = await Reflect.apply(originalClose, this, args);
              closeCompleted = true;
              return result;
            } finally {
              releasePageAfterClose(page, closeCompleted);
            }
          };
          page.close = wrappedClose;
        }
        pageRestorations.set(page, { originalClose, wrappedClose });
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
    let bindingDisposable;
    let initScriptDisposable;
    try {
      bindingDisposable = await context.exposeBinding(bindingName, (source, snapshot) => {
        const page = source && source.page;
        if (!page) throw coverageError('Playwright coverage binding omitted its page.');
        recordSnapshot(page, snapshot);
      });
      initScriptDisposable = await context.addInitScript(browserScripts.install);

      const originalNewPage = context.newPage;
      let wrappedNewPage;
      if (typeof originalNewPage === 'function') {
        wrappedNewPage = async function meteorRstestCoverageNewPage(...args) {
          const page = await Reflect.apply(originalNewPage, this, args);
          await trackPage(page);
          return page;
        };
        context.newPage = wrappedNewPage;
      }
      const originalClose = context.close;
      let wrappedClose;
      if (typeof originalClose === 'function') {
        wrappedClose = async function meteorRstestCoverageContextClose(...args) {
          const pages = context.pages();
          let closeCompleted = false;
          try {
            for (const page of pages) await capturePage(page);
            const result = await Reflect.apply(originalClose, this, args);
            closeCompleted = true;
            return result;
          } finally {
            for (const page of pages) {
              releasePageAfterClose(page, closeCompleted);
            }
          }
        };
        context.close = wrappedClose;
      }
      let pageListener;
      if (typeof context.on === 'function') {
        pageListener = page => {
          const tracking = trackPage(page);
          pendingTracking.add(tracking);
          tracking.then(
            () => pendingTracking.delete(tracking),
            error => {
              pendingTracking.delete(tracking);
              trackingErrors.push(error);
            },
          );
        };
        context.on('page', pageListener);
      }
      contextRestorations.set(context, {
        bindingDisposable,
        initScriptDisposable,
        originalClose,
        originalNewPage,
        pageListener,
        wrappedClose,
        wrappedNewPage,
      });
      for (const page of context.pages()) await trackPage(page);
    } catch (error) {
      try {
        await disposePlaywrightResources([initScriptDisposable, bindingDisposable]);
      } catch (disposeError) {
        throw new AggregateError(
          [error, disposeError],
          '[Meteor Rstest] Failed to install Playwright coverage capture.',
        );
      }
      throw error;
    }
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
        const pages = browser.contexts().flatMap(context => context.pages());
        let closeCompleted = false;
        try {
          for (const page of pages) await capturePage(page);
          const result = await Reflect.apply(originalClose, this, args);
          closeCompleted = true;
          return result;
        } finally {
          for (const page of pages) {
            releasePageAfterClose(page, closeCompleted);
          }
        }
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
        await releaseBrowserInstrumentation();
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
        await releaseBrowserInstrumentation();
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
