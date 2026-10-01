import fs from 'fs-extra';
import http from 'http';
import path from 'path';
import {
  buildMeteorApp,
  cleanupTempDir,
  getFreePort,
  runBuiltApp,
  runMeteorCommand,
  setupMeteorApp,
  startMongo,
} from '../helpers';
import { linkLocalRspack } from '../test-helpers';

describe('Regressions / Rspack static assets /', () => {
  let tempDir;
  let buildOutputDir;
  let app;
  let mongo;
  let origin;
  let serverDir;
  let assetUrl;
  let chunkUrl;

  function request(url, options) {
    return new Promise((resolve, reject) => {
      const req = http.request(origin, { ...options, path: url }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: new Headers(res.headers),
          body: Buffer.concat(chunks).toString(),
        }));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => req.destroy(new Error(`Timed out requesting ${url}`)));
      req.end();
    });
  }

  async function state() {
    const response = await request('/__static-asset-state');
    expect(response.status).toBe(200);
    return JSON.parse(response.body);
  }

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp('assets'));
    await fs.appendFile(path.join(tempDir, 'server/main.js'), `
import { WebApp, WebAppInternals } from 'meteor/webapp';
// Diagnostics exist only in this disposable test app.
WebApp.rawHandlers.use('/__static-asset-state', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    cwd: process.cwd(),
    counts: Object.fromEntries(Object.entries(WebAppInternals.staticFilesByArch)
      .map(([arch, files]) => [arch, Object.keys(files).length])),
    paths: Object.fromEntries(Object.entries(
      WebAppInternals.staticFilesByArch[WebApp.categorizeRequest(req).arch])
      .filter(([url]) => /^\\/build-(assets|chunks)\\//.test(url))
      .map(([url, info]) => [url, info.absolutePath])),
  }));
});
`);
    await fs.outputFile(path.join(tempDir, 'client/lazy-probe.js'),
      'export default "rspack lazy chunk loaded";\n');
    await fs.outputFile(path.join(tempDir, 'client/probe.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await fs.appendFile(path.join(tempDir, 'client/main.js'), `
import image from './probe.svg';
globalThis.staticAssetProbe = { image, load: () => import('./lazy-probe') };
`);
    await fs.outputFile(path.join(tempDir, 'public/ordinary.txt'), 'ordinary public asset');
    await fs.writeFile(path.join(tempDir, 'rspack.config.js'), `
const { defineConfig } = require('@meteorjs/rspack');
module.exports = defineConfig({
  module: { rules: [{ test: /\\.svg$/, type: 'asset/resource' }] },
});
`);
    await runMeteorCommand('add', ['rspack'], tempDir, { checkExitCode: true });
    await linkLocalRspack(tempDir);
    ({ buildOutputDir } = await buildMeteorApp(tempDir, {
      commandOptions: ['--directory', '--server-only'],
    }));
    mongo = await startMongo();
    if (!mongo) throw new Error('This regression requires bundled MongoDB or MONGO_URL');
    const port = await getFreePort();
    origin = `http://localhost:${port}`;
    app = await runBuiltApp(buildOutputDir, { port, mongoUrl: mongo.mongoUrl });
    serverDir = (await state()).cwd;
    await page.goto(origin);
    await page.waitForFunction(() => !!globalThis.staticAssetProbe);
    expect(await page.evaluate(async () => (await staticAssetProbe.load()).default))
      .toBe('rspack lazy chunk loaded');
    assetUrl = await page.evaluate(() => staticAssetProbe.image);
    chunkUrl = await page.evaluate(() => new URL(performance.getEntriesByType('resource')
      .find(entry => new URL(entry.name).pathname.startsWith('/build-chunks/')).name).pathname);
    expect(assetUrl).toMatch(/^\/build-assets\//);
    expect(chunkUrl).toMatch(/^\/build-chunks\//);
  }, 600000);

  afterAll(async () => {
    await page.goto('about:blank');
    if (app) await app.stop();
    if (mongo) await mongo.stop();
    if (buildOutputDir) await cleanupTempDir(buildOutputDir);
    if (tempDir) await cleanupTempDir(tempDir);
  });

  test.each(['build-chunks', 'build-assets'])('%s misses return uncached 404s', async (context) => {
    for (const method of ['GET', 'HEAD']) {
      const response = await request(`/${context}/missing-after-deploy.js`, { method });
      expect({ method, status: response.status }).toEqual({ method, status: 404 });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('etag')).toBeNull();
      expect(response.body).not.toContain('<html');
    }
  });

  test.each(['build-chunks', 'build-assets'])('%s misses do not accumulate manifest entries', async (context) => {
    const before = (await state()).counts;
    // A bounded request sample proves retained state growth without exhausting memory.
    for (let index = 0; index < 32; index++) {
      await request(`/${context}/absent-${index}.js`);
    }
    const after = (await state()).counts;
    console.log(`${context} manifest counts: ${JSON.stringify({ before, after })}`);
    expect(after).toEqual(before);
  });

  test('real assets retain static HTTP semantics', async () => {
    const before = (await state()).counts;
    for (const url of [assetUrl, chunkUrl]) {
      const response = await request(url);
      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.headers.get('cache-control')).toContain('max-age=31536000');
      const etag = response.headers.get('etag');
      expect(etag).toBeTruthy();
      const head = await request(url, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.body).toBe('');
      expect(head.headers.get('content-length')).toBe(response.headers.get('content-length'));
      expect((await request(url, { headers: { 'If-None-Match': etag } })).status).toBe(304);
      const range = await request(url, { headers: { Range: 'bytes=0-9' } });
      expect(range.status).toBe(206);
      expect(range.body).toBe(response.body.slice(0, 10));
    }
    expect((await state()).counts).toEqual(before);
    expect((await request('/ordinary.txt')).body).toBe('ordinary public asset');
    expect((await request('/application-route')).headers.get('content-type')).toContain('text/html');
  });

  test('files outside the build manifest and their URL aliases do not accumulate entries', async () => {
    // Development output can be on disk without appearing in a built manifest.
    // Checking existence alone would still retain every spelling of this file.
    const url = '/build-assets/runtime-probe.123.svg';
    const diskPath = path.join(serverDir, url);
    const contents = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    await fs.outputFile(diskPath, contents);
    try {
      expect((await request(url)).body).toBe(contents);
      const before = (await state()).counts;
      for (let index = 1; index <= 16; index++) {
        const alias = url.replace('/build-assets/', `/build-assets/${'/'.repeat(index)}`);
        const response = await request(alias);
        expect(response.status).toBe(200);
        expect(response.body).toBe(contents);
      }
      const after = (await state()).counts;
      console.log(`Existing-file alias manifest counts: ${JSON.stringify({ before, after })}`);
      expect(after).toEqual(before);
    } finally {
      await fs.remove(diskPath);
    }
  });

  test('removed files and directories return uncached 404s and can become available again', async () => {
    const diskPath = (await state()).paths[assetUrl];
    const contents = await fs.readFile(diskPath);
    const before = (await state()).counts;
    try {
      await fs.remove(diskPath);
      const missing = await request(assetUrl);
      expect(missing.status).toBe(404);
      expect(missing.headers.get('cache-control')).toBe('no-store');
      expect(missing.headers.get('etag')).toBeNull();
      await fs.ensureDir(diskPath);
      expect((await request(assetUrl)).status).toBe(404);
    } finally {
      await fs.remove(diskPath);
      await fs.writeFile(diskPath, contents);
    }
    expect((await request(assetUrl)).status).toBe(200);
    expect((await state()).counts).toEqual(before);
  });

  test('decoded paths stay within the asset directory', async () => {
    const outsidePath = path.join(serverDir, 'outside-static-assets.txt');
    await fs.writeFile(outsidePath, 'not a public asset');
    try {
      for (const url of [
        '/build-assets/..%2foutside-static-assets.txt',
        '/build-assets/..%5coutside-static-assets.txt',
        '/build-assets/invalid%00.svg',
        '/build-assets/invalid%.svg',
      ]) {
        const response = await request(url);
        expect({ url, status: response.status }).toEqual({ url, status: 404 });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.body).not.toContain('not a public asset');
      }
      const encodedUrl = assetUrl.replace(/[^/]+$/, filename =>
        `%${filename.charCodeAt(0).toString(16)}${filename.slice(1)}`);
      expect((await request(encodedUrl)).body).toBe((await request(assetUrl)).body);
      expect((await request(encodedUrl)).status).toBe(200);
    } finally {
      await fs.remove(outsidePath);
    }
  });
});
