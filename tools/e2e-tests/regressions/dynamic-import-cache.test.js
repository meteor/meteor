import fs from 'fs';
import http from 'http';
import path from 'path';

// Exercise the production cache with real browser IndexedDB. Package tests
// normally disable this cache because Meteor.isProduction is false.
describe('Regressions / Dynamic import cache /', () => {
  let server;
  let origin;

  beforeAll(async () => {
    const source = fs.readFileSync(path.resolve(
      __dirname, '../../../packages/dynamic-import/cache.js'
    ), 'utf8');
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Dynamic import cache regression</title>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    // Every test gets a fresh realm and database, including a fresh dbPromise.
    await page.addInitScript(({ source }) => {
      window.cacheErrors = [];
      window.cacheConnections = [];
      window.cacheCloses = 0;
      window.cacheWritesSettled = 0;
      window.addEventListener('unhandledrejection', event => {
        window.cacheErrors.push(String(event.reason));
        event.preventDefault();
      });
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        const request = open.apply(this, args);
        request.addEventListener('success', () => {
          window.cacheConnections.push(request.result);
          request.result.addEventListener('close', () => ++window.cacheCloses);
        });
        return request;
      };
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const isWrite = args[1] === 'readwrite';
        try {
          const txn = transaction.apply(this, args);
          if (isWrite) {
            const settled = () => ++window.cacheWritesSettled;
            txn.addEventListener('complete', settled);
            txn.addEventListener('abort', settled);
          }
          return txn;
        } catch (error) {
          if (isWrite) ++window.cacheWritesSettled;
          throw error;
        }
      };
      window.cache = {};
      new Function('Meteor', 'exports', source)(
        { isClient: true, isCordova: false, isProduction: true }, window.cache
      );
    }, { source });
  });

  beforeEach(async () => {
    await page.goto(origin);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('MeteorDynamicImportCache');
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    }));
  });

  afterAll(async () => {
    await page.goto('about:blank');
    await new Promise(resolve => server.close(resolve));
  });

  async function expectStoredSource() {
    const writes = await page.evaluate(() => cacheWritesSettled);
    await page.evaluate(() => cache.setMany({ module: {
      version: 'cached-version', source: 'export default 42;'
    } }));
    // Do not poll checkMany: the cache deliberately postpones writes while
    // reads are in flight. Wait for the real write transaction to settle.
    await page.waitForFunction(previous => cacheWritesSettled > previous, writes);
    expect(await page.evaluate(() => cache.checkMany({ module: 'cached-version' })))
      .toEqual({ module: 'export default 42;' });
    expect(await page.evaluate(() => cacheErrors)).toEqual([]);
  }

  it('stores and reads sources and treats unknown versions as cache misses', async () => {
    expect(await page.evaluate(() => cache.checkMany({ missing: 'unknown' })))
      .toEqual({ missing: null });
    await expectStoredSource();
  });

  it('falls back after a closed read connection and reopens for later caching', async () => {
    await page.evaluate(async () => {
      await cache.checkMany({ warmup: 'warmup' });
      cacheConnections[0].close();
    });
    expect(await page.evaluate(() => cache.checkMany({ missing: 'unknown' })))
      .toEqual({ missing: null });
    await expectStoredSource();
  });

  it('does not leak a rejection when the connection closes before a delayed write', async () => {
    await page.evaluate(async () => {
      await cache.checkMany({ warmup: 'warmup' });
      cache.setMany({ lost: { version: 'lost', source: 'disposable' } });
      cacheConnections[0].close();
    });
    await page.waitForFunction(() => cacheWritesSettled > 0);
    expect(await page.evaluate(() => cacheErrors)).toEqual([]);
    await expectStoredSource();
  });

  it('does not leak put request failures from an aborted write transaction', async () => {
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        IDBObjectStore.prototype.put = put;
        const request = put.apply(this, args);
        this.transaction.abort();
        return request;
      };
      cache.setMany({ lost: { version: 'lost', source: 'disposable' } });
    });
    await page.waitForFunction(() => cacheWritesSettled > 0);
    expect(await page.evaluate(() => cacheErrors)).toEqual([]);
    await expectStoredSource();
  });

  it('recovers after the browser clears site data and force-closes IndexedDB', async () => {
    await expectStoredSource();
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Storage.clearDataForOrigin', {
        origin, storageTypes: 'indexeddb'
      });
      await page.waitForFunction(() => cacheCloses > 0);
      expect(await page.evaluate(() => cache.checkMany({ module: 'cached-version' })))
        .toEqual({ module: null });
      await expectStoredSource();
    } finally {
      await session.detach();
    }
  });

  it('allows database deletion and reopens after a version change', async () => {
    await expectStoredSource();
    await page.evaluate(() => {
      window.cacheDeleted = false;
      indexedDB.deleteDatabase('MeteorDynamicImportCache').onsuccess = () => {
        window.cacheDeleted = true;
      };
    });
    await page.waitForFunction(() => cacheDeleted, null, { timeout: 5000 });
    await expectStoredSource();
  });

  it('keeps the new connection when an old connection reports a late close', async () => {
    await page.evaluate(async () => {
      await cache.checkMany({ warmup: 'warmup' });
      cacheConnections[0].close();
      await cache.checkMany({ missing: 'unknown' });
    });
    await expectStoredSource();
    const connectionCount = await page.evaluate(() => cacheConnections.length);
    await page.evaluate(() => cacheConnections[0].dispatchEvent(new Event('close')));
    expect(await page.evaluate(() => cache.checkMany({ module: 'cached-version' })))
      .toEqual({ module: 'export default 42;' });
    expect(await page.evaluate(() => cacheConnections.length)).toBe(connectionCount);
  });
});
