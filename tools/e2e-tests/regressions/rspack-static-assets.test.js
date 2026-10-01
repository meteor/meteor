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
import nodeFs from 'fs';
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
// Remove a file after send's stat succeeds, before its read stream opens it.
let deleteAfterStat;
const originalStat = nodeFs.stat;
nodeFs.stat = function(filename, ...args) {
  const callback = args.pop();
  return originalStat.call(this, filename, ...args, (error, stats) => {
    if (!error && filename === deleteAfterStat) {
      deleteAfterStat = null;
      nodeFs.unlinkSync(filename);
    }
    callback(error, stats);
  });
};
WebApp.rawHandlers.use('/__static-asset-control', async (req, res, next) => {
  try {
    const arch = WebApp.categorizeRequest(req).arch;
    if (req.url === '/pause') {
      await WebAppInternals.pauseClient(arch);
    } else if (req.url === '/resume') {
      await WebAppInternals.generateClientProgram(arch);
    } else if (req.url === '/inline') {
      WebAppInternals.staticFilesByArch[arch]['/build-assets/inline-probe.js'] = {
        content: 'console.log("inline static content");',
        type: 'js', hash: 'inline-probe', cacheable: true,
      };
    } else if (req.url.startsWith('/delete-after-stat?')) {
      deleteAfterStat = new URL(req.url, 'http://localhost').searchParams.get('file');
    } else {
      return next();
    }
    res.end('ok');
  } catch (error) { next(error); }
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
      for (const prefix of ['/__browser', '/__browser.legacy']) {
        const selected = await request(`${prefix}${url}?probe=1`);
        expect(selected.status).toBe(200);
        expect(selected.headers.get('content-type')).toBe(response.headers.get('content-type'));
      }
      expect((await request(url, { method: 'OPTIONS' })).status).toBe(200);
      expect((await request(url, { method: 'POST' })).status).toBe(405);
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
    const before = (await state()).counts;
    await fs.outputFile(diskPath, contents);
    try {
      expect((await request(url)).body).toBe(contents);
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
    expect((await request(url)).status).toBe(404);
    expect((await state()).counts).toEqual(before);
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

  test('waits for a paused client before resolving a temporarily missing asset', async () => {
    const diskPath = (await state()).paths[assetUrl];
    const contents = await fs.readFile(diskPath);
    let pending;
    let earlyResult;
    try {
      expect((await request('/__static-asset-control/pause')).status).toBe(200);
      await fs.remove(diskPath);
      pending = request(assetUrl);
      earlyResult = await Promise.race([
        pending.then(response => `responded ${response.status}`),
        new Promise(resolve => setTimeout(() => resolve('waiting for rebuild'), 250)),
      ]);
    } finally {
      await fs.writeFile(diskPath, contents);
      expect((await request('/__static-asset-control/resume')).status).toBe(200);
    }
    expect(earlyResult).toBe('waiting for rebuild');
    expect((await pending).status).toBe(200);
  });

  test('preserves existing in-memory static content', async () => {
    try {
      expect((await request('/__static-asset-control/inline')).status).toBe(200);
      const response = await request('/build-assets/inline-probe.js');
      expect(response.status).toBe(200);
      expect(response.body).toBe('console.log("inline static content");');
    } finally {
      // Reload the real build manifest to discard the injected entry.
      expect((await request('/__static-asset-control/resume')).status).toBe(200);
    }
  });

  test('returns an uncached 404 if a file disappears between stat and open', async () => {
    const diskPath = (await state()).paths[assetUrl];
    const contents = await fs.readFile(diskPath);
    try {
      const controlUrl = `/__static-asset-control/delete-after-stat?file=${encodeURIComponent(diskPath)}`;
      expect((await request(controlUrl)).status).toBe(200);
      const response = await request(assetUrl);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      for (const header of ['etag', 'content-length', 'content-range', 'x-sourcemap']) {
        expect(response.headers.get(header)).toBeNull();
      }
    } finally {
      await fs.writeFile(diskPath, contents);
    }
    expect((await request(assetUrl)).status).toBe(200);
  });
});
