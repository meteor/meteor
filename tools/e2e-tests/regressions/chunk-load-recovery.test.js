import fs from 'fs-extra';
import path from 'path';
import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  resetPlaywrightPage,
  runMeteorApp,
  wait,
} from '../helpers';
import { setupMeteorRspackApp } from '../test-helpers';

const STORAGE_KEY = 'meteor-rspack:chunk-load-reload-at';
const CHUNK_URL = '**/build-chunks/**';

// Exposes a lazy import, so the build has a chunk that loads only on demand.
const LAZY_LOADER = `
window.__loadLazyChunk = () =>
  import('/imports/lazy-chunk.js').then(
    (module) => module.lazyValue,
    (error) => 'rejected:' + error.name
  );
`;

// Fails the next chunk request as a server does after a deploy removed the file.
async function failNextChunkRequest() {
  await page.route(
    CHUNK_URL,
    (route) => route.fulfill({ status: 500, body: '' }),
    { times: 1 }
  );
}

async function loadLazyChunk() {
  return page.evaluate(() => window.__loadLazyChunk());
}

describe('Regressions / ChunkLoadRecovery /', () => {
  const port = 3147;
  const rspackPort = 18147;
  const appUrl = `http://localhost:${port}/`;
  let tempDir;
  let meteorProcess;

  beforeAll(async () => {
    let appDir;
    ({ tempDir, appDir } = await setupMeteorRspackApp({ appName: 'react' }));
    await fs.writeFile(
      path.join(appDir, 'imports', 'lazy-chunk.js'),
      "export const lazyValue = 'lazy chunk loaded';\n"
    );
    await fs.appendFile(path.join(appDir, 'client', 'main.jsx'), LAZY_LOADER);

    await killProcessByPort([port, rspackPort]);
    ({ meteorProcess } = await runMeteorApp(tempDir, port, {
      waitForOutput: `=> App running at http://localhost:${port}/`,
      commandOptions: ['--production'],
      env: { RSPACK_DEVSERVER_PORT: String(rspackPort) },
    }));
  }, 600_000);

  afterAll(async () => {
    await resetPlaywrightPage();
    await killMeteorProcess(meteorProcess);
    await killProcessByPort([port, rspackPort]);
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    await page.unrouteAll();
    await page.goto(appUrl, { waitUntil: 'load' });
    await page.evaluate(() => window.sessionStorage.clear());
    await page.waitForFunction(() => typeof window.__loadLazyChunk === 'function');
  });

  test('loads the lazy chunk without a reload when the server answers', async () => {
    expect(await loadLazyChunk()).toBe('lazy chunk loaded');
    expect(
      await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)
    ).toBeNull();
  });

  test('reloads the page once when a lazy chunk fails to load', async () => {
    await failNextChunkRequest();
    const reloaded = page.waitForEvent('load');

    expect(await loadLazyChunk()).toBe('rejected:ChunkLoadError');
    await reloaded;

    await page.waitForFunction(() => typeof window.__loadLazyChunk === 'function');
    expect(
      await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)
    ).toMatch(/^\d+$/);
    expect(await loadLazyChunk()).toBe('lazy chunk loaded');
  });

  test('leaves a second failure within the cooldown to the app', async () => {
    await page.evaluate(
      (key) => window.sessionStorage.setItem(key, String(Date.now())),
      STORAGE_KEY
    );
    await failNextChunkRequest();
    const navigations = [];
    const onNavigate = (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    };
    page.on('framenavigated', onNavigate);

    expect(await loadLazyChunk()).toBe('rejected:ChunkLoadError');
    await wait(2000);

    page.off('framenavigated', onNavigate);
    expect(navigations).toEqual([]);
  });
});
