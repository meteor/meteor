import path from 'path';
import fs from 'fs-extra';
import {
  setupMeteorApp,
  runMeteorCommand,
  waitForMeteorOutput,
  killMeteorProcess,
  killProcessByPort,
  cleanupTempDir,
  buildMeteorApp,
  runBuiltApp,
} from './helpers';
import {
  browserInspector,
  checkDebugging,
  checkEmittedMap,
  hasSource,
} from './source-map-helpers';
import { connectInspector, getInspectorWebSocketUrl } from './inspector';

const { linkLocalRspack } = require('./scripts/link-rspack');
const PORT = 3170;
const RSPACK_PORT = 18170;
const INSPECTOR_PORT = 9270;
const fixture = path.join(__dirname, 'apps/source-maps');
const legacyUserAgent =
  'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko';

describe('Regressions / Source Maps /', () => {
  let appDir;
  let meteorProcess;
  let buildOutputDir;
  let builtApp;
  const contexts = [];

  beforeEach(async () => {
    await killProcessByPort([PORT, RSPACK_PORT, INSPECTOR_PORT]);
    ({ tempDir: appDir } = await setupMeteorApp('source-maps', {
      tempDirSegments: ['meteor source maps ü'],
    }));
  });

  afterEach(async () => {
    for (const context of contexts.splice(0)) await context.close();
    if (builtApp) await builtApp.stop();
    await killMeteorProcess(meteorProcess);
    await killProcessByPort([PORT, RSPACK_PORT, INSPECTOR_PORT]);
    if (appDir) await cleanupTempDir(appDir);
    if (buildOutputDir) await cleanupTempDir(buildOutputDir);
    meteorProcess = null;
    builtApp = null;
    buildOutputDir = null;
  });

  async function enableRspack() {
    await runMeteorCommand('add', ['rspack'], appDir, { checkExitCode: true });
    if (process.env.NPM_LINK_RSPACK !== 'false') await linkLocalRspack(appDir);
  }

  async function startApp(args = []) {
    const result = await runMeteorCommand(
      'run',
      ['--port', String(PORT), ...args],
      appDir,
      {
        captureOutput: true,
        env: {
          RSPACK_DEVSERVER_PORT: String(RSPACK_PORT),
          MONGO_URL: 'mongodb://127.0.0.1:27017/unused',
        },
      },
    );
    meteorProcess = result.meteorProcess;
    await waitForMeteorOutput(result.outputLines, '=> App running at', {
      meteorProcess,
    });
  }

  test('maps browser breakpoints, stepping and exceptions, including lazy code and rebuilds', async () => {
    await enableRspack();
    await startApp();
    const clients = [];
    const eagerPath = 'imports/probe.ts';
    const lazyPath = 'imports/lazy.ts';
    let eager = await fs.readFile(path.join(fixture, eagerPath), 'utf8');
    let lazy = await fs.readFile(path.join(fixture, lazyPath), 'utf8');

    async function checkClient({ page, context, inspector }, initial = true) {
      const eagerMap = await checkDebugging(
        inspector,
        context.request,
        'sourceMapProbe',
        eagerPath,
        eager,
      );
      if (initial)
        expect(await page.evaluate(() => typeof globalThis.sourceMapLazy)).toBe(
          'undefined',
        );
      await page.evaluate(() => sourceMapProbe.loadLazy());
      const lazyMap = await checkDebugging(
        inspector,
        context.request,
        'sourceMapLazy',
        lazyPath,
        lazy,
      );
      if (initial)
        expect(lazyMap.script.scriptId).not.toBe(eagerMap.script.scriptId);
    }

    for (const legacy of [false, true]) {
      const context = await browser.newContext(
        legacy ? { userAgent: legacyUserAgent } : {},
      );
      contexts.push(context);
      const page = await context.newPage();
      const inspector = browserInspector(
        await context.newCDPSession(page),
        context.request,
      );
      await inspector.send('Debugger.enable');
      await page.goto(`http://localhost:${PORT}/`);
      await page.waitForFunction(() => globalThis.sourceMapProbe);
      expect(
        await page.evaluate(() => __meteor_runtime_config__.isModern),
      ).toBe(!legacy);
      const client = { page, context, inspector };
      clients.push(client);
      await checkClient(client);
    }

    // Shift original line numbers so stale maps cannot accidentally pass.
    eager = '\n\n' + eager.replace("'initial'", "'rebuilt'");
    lazy = '\n\n\n' + lazy.replace('input + 3', 'input + 4');
    await fs.writeFile(path.join(appDir, lazyPath), lazy);
    await fs.writeFile(path.join(appDir, eagerPath), eager);
    for (const client of clients) {
      await client.page.waitForFunction(
        () => globalThis.sourceMapProbe?.revision === 'rebuilt',
        null,
        { timeout: 60000 },
      );
      await checkClient(client, false);
      await client.inspector.close();
    }
  }, 600000);

  test.each(['Meteor', 'Rspack'])(
    'maps %s server breakpoints, stepping and stack traces to original TypeScript',
    async (bundler) => {
      if (bundler === 'Rspack') await enableRspack();
      await startApp([`--inspect=${INSPECTOR_PORT}`]);
      const inspector = await connectInspector(
        await getInspectorWebSocketUrl(INSPECTOR_PORT),
      );
      try {
        await inspector.send('Debugger.enable');
        const contents = await fs.readFile(
          path.join(fixture, 'server/probe.ts'),
          'utf8',
        );
        await checkDebugging(
          inspector,
          null,
          'sourceMapProbe',
          'server/probe.ts',
          contents,
          {
            // Babel records the multiply instruction at the end of its left
            // operand; SWC records the beginning. Keep both expectations exact.
            stepToken: bundler === 'Meteor' ? ' * 2' : 'adjusted *',
            // Meteor installs source-map-support; test its mapped stack below.
            checkException: false,
          },
        );
        const response = await fetch(
          `http://localhost:${PORT}/source-map-probe`,
        );
        const body = await response.json();
        expect(body.value).toBe(12);
        expect(body.stack).toContain('server/probe.ts:10:9');
      } finally {
        inspector.close();
      }
    },
    300000,
  );

  async function checkBuild(
    mode,
    transpiler,
    { keepRspackCache = false } = {},
  ) {
    if (transpiler === 'SWC') {
      const filename = path.join(appDir, 'package.json');
      const pkg = await fs.readJson(filename);
      pkg.meteor.modern = { transpiler: { verbose: true } };
      await fs.writeJson(filename, pkg, { spaces: 2 });
    }
    await enableRspack();
    // --server-only emits the Cordova web program without requiring an SDK.
    // Native debugger/device validation remains a separate acceptance check.
    await fs.appendFile(path.join(appDir, '.meteor/platforms'), 'android\n');
    const firstBuild = await buildMeteorApp(appDir, {
      commandOptions: [
        '--directory',
        '--server-only',
        ...(mode === 'debug' ? ['--debug'] : []),
      ],
    });
    buildOutputDir = firstBuild.buildOutputDir;
    if (transpiler === 'SWC') {
      // A silent fallback to Babel would not exercise SWC map composition.
      expect(
        firstBuild.processResult.outputLines.some((line) =>
          /Used.*SWC.*client-rspack\.js.*web\.browser\.legacy/.test(line),
        ),
      ).toBe(true);
    }

    async function checkBuildMaps() {
      const contents = await fs.readFile(
        path.join(appDir, 'imports/probe.ts'),
        'utf8',
      );
      const programs = path.join(buildOutputDir, 'bundle/programs');
      for (const arch of ['web.browser', 'web.browser.legacy', 'web.cordova']) {
        const programDir = path.join(programs, arch);
        const { manifest } = await fs.readJson(
          path.join(programDir, 'program.json'),
        );
        let checked = 0;
        for (const entry of manifest.filter(
          (entry) => entry.type === 'js' && entry.sourceMap,
        )) {
          const raw = await fs.readJson(path.join(programDir, entry.sourceMap));
          if (hasSource(raw, 'imports/probe.ts')) {
            checkEmittedMap(
              raw,
              await fs.readFile(path.join(programDir, entry.path), 'utf8'),
              'imports/probe.ts',
              contents,
              'source map eager failure',
            );
            checked++;
          }
        }
        // The standard production minifier does not emit maps. Debug builds
        // must preserve the composed Rspack -> Meteor mappings for every target.
        if (mode === 'debug' && checked === 0) {
          throw new Error(`Missing original TypeScript map in ${arch}`);
        }
      }

      // Rspack's hidden production maps still need accurate mappings, even when
      // Meteor's final minifier discards the browser map. Check the generated
      // code alongside each map rather than accepting a self-consistent map.
      const maps = [];
      async function collectMaps(dir) {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const filename = path.join(dir, entry.name);
          if (entry.isDirectory()) await collectMaps(filename);
          else if (entry.name.endsWith('.map')) maps.push(filename);
        }
      }
      await collectMaps(path.join(appDir, '_build'));
      await collectMaps(path.join(appDir, 'public/build-chunks'));
      const hiddenChecked = { eager: 0, lazy: 0, server: 0 };
      for (const filename of maps) {
        const raw = await fs.readJson(filename);
        for (const [kind, sourcePath] of [
          ['eager', 'imports/probe.ts'],
          ['lazy', 'imports/lazy.ts'],
          ['server', 'server/probe.ts'],
        ]) {
          if (hasSource(raw, sourcePath)) {
            checkEmittedMap(
              raw,
              await fs.readFile(filename.slice(0, -4), 'utf8'),
              sourcePath,
              await fs.readFile(path.join(appDir, sourcePath), 'utf8'),
              `source map ${kind} failure`,
            );
            hiddenChecked[kind]++;
          }
        }
      }
      expect(hiddenChecked.eager).toBeGreaterThan(0);
      expect(hiddenChecked.lazy).toBeGreaterThan(0);
      expect(hiddenChecked.server).toBeGreaterThan(0);
    }

    await checkBuildMaps();
    if (mode === 'debug') {
      // Change only source locations: Rspack emits identical JavaScript,
      // so a cache keyed only by that JavaScript would retain a stale map.
      const generatedPath = path.join(
        appDir,
        '_build/main-prod/client-rspack.js',
      );
      const before = await fs.readFile(generatedPath, 'utf8');
      const originalPath = path.join(appDir, 'imports/probe.ts');
      await fs.writeFile(
        originalPath,
        '\n\n' + (await fs.readFile(originalPath, 'utf8')),
      );
      // Isolate Meteor's compiler/linker caches. Rspack's persistent cache
      // currently retains the old upstream map for this edit (see below).
      if (!keepRspackCache) {
        await fs.remove(path.join(appDir, 'node_modules/.cache/rspack'));
      }
      await cleanupTempDir(buildOutputDir);
      ({ buildOutputDir } = await buildMeteorApp(appDir, {
        commandOptions: ['--directory', '--server-only', '--debug'],
      }));
      expect(await fs.readFile(generatedPath, 'utf8')).toBe(before);
      await checkBuildMaps();
    }

    builtApp = await runBuiltApp(buildOutputDir, {
      port: PORT,
      mongoUrl: 'mongodb://127.0.0.1:27017/unused',
    });
    const response = await fetch(`http://localhost:${PORT}/source-map-probe`);
    // Rspack minifies the constructor to Error(...), mapped to the identifier
    // at column 13 rather than the original `new` at column 9.
    expect((await response.json()).stack).toContain('server/probe.ts:10:13');
    for (const legacy of [false, true]) {
      const context = await browser.newContext(
        legacy ? { userAgent: legacyUserAgent } : {},
      );
      contexts.push(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://localhost:${PORT}/`);
      try {
        await page.waitForFunction(() => globalThis.sourceMapProbe);
      } catch (error) {
        throw new Error(
          `${legacy ? 'Legacy' : 'Modern'} browser failed to start: ${errors.join('\n')}`,
          { cause: error },
        );
      }
      expect(
        await page.evaluate(() => __meteor_runtime_config__.isModern),
      ).toBe(!legacy);
      expect(await page.evaluate(() => sourceMapProbe.probe(5))).toBe(12);
      await page.evaluate(() => sourceMapProbe.loadLazy());
      expect(await page.evaluate(() => sourceMapLazy.probe(5))).toBe(16);
    }
  }

  test.each([
    ['debug', 'Babel'],
    ['debug', 'SWC'],
    ['production', 'Babel'],
  ])(
    '%s build preserves emitted mappings for modern, legacy and Cordova clients with %s',
    (mode, transpiler) => checkBuild(mode, transpiler),
    600000,
  );

  // Known failure with Rspack 2.2.0: an edit that changes only source locations
  // leaves client-rspack.js.map stale in its persistent cache, before Meteor
  // reads it. Keep the full regression ready for a candidate fixing this gap.
  test.skip(
    'updates source locations with a warm Rspack persistent cache',
    () => checkBuild('debug', 'Babel', { keepRspackCache: true }),
    600000,
  );
});
