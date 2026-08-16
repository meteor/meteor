const { createRequire } = require('node:module');

const coverageProviderRequire = createRequire(
  require.resolve('@rstest/coverage-istanbul'),
);
const { createCoverageMap } = coverageProviderRequire('istanbul-lib-coverage');

const COVERAGE_CHUNK_BYTES = 128 * 1024;
const MAX_COVERAGE_BYTES = 64 * 1024 * 1024;
const GENERATION_PATTERN = /^[a-f0-9]{32,128}$/i;
const PRODUCER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function coverageError(message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = 'METEOR_RSTEST_PLAYWRIGHT_COVERAGE';
  return error;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function installBrowserCapture({ bindingName }) {
  const documentIdKey = '__meteorRstestCoverageDocumentId';
  const captureInstalledKey = '__meteorRstestCoverageCaptureInstalled';
  if (!globalThis[documentIdKey]) {
    const random = globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
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
}

function readBrowserCoverage() {
  return {
    documentId: globalThis.__meteorRstestCoverageDocumentId,
    coverage: globalThis.__coverage__ || {},
  };
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
  const trackedContexts = new WeakSet();
  const trackedPages = new Set();
  const pageTracking = new WeakMap();
  const pendingTracking = new Set();
  const trackingErrors = [];
  const pageIds = new WeakMap();
  const snapshots = new Map();
  let nextPageId = 1;
  let submitPromise;
  const bindingName = `__meteorRstestCoverage_${String(generation || 'collector')}`;

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
    const snapshot = await page.evaluate(readBrowserCoverage);
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
          await page.evaluate(installBrowserCapture, { bindingName });
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
    await context.addInitScript(installBrowserCapture, { bindingName });

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
    if (typeof originalNewContext === 'function') {
      browser.newContext = async function meteorRstestCoverageNewContext(...args) {
        const context = await Reflect.apply(originalNewContext, this, args);
        await trackContext(context);
        return context;
      };
    }
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
    })();
    return submitPromise;
  }

  return {
    captureRemaining,
    install,
    mergedCoverage,
    submit,
  };
}

module.exports = {
  createPlaywrightCoverageCollector,
};
