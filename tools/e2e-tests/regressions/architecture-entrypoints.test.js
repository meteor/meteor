import path from 'path';
import fs from 'fs-extra';
import { parse } from 'acorn';
import execa from 'execa';
import {
  buildMeteorApp,
  cleanupTempDir,
  getFreePort,
  killMeteorProcess,
  runBuiltApp,
  runMeteorApp,
  runMeteorTests,
  setupMeteorApp,
  startMongo,
} from '../helpers';
import { assertBrowserEntrypoints, legacyUserAgent } from '../legacy-helpers';

const { linkLocalRspack } = require('../scripts/link-rspack');

async function readProgramJavaScript(buildOutputDir, arch, { appOnly = false } = {}) {
  const programDir = path.join(buildOutputDir, 'bundle', 'programs', arch);
  const { manifest } = await fs.readJson(path.join(programDir, 'program.json'));
  const scripts = manifest.filter(file =>
    file.type === 'js' && (!appOnly || file.path.startsWith('app/'))
  );
  expect(scripts.length).toBeGreaterThan(0);
  const sources = await Promise.all(
    scripts.map(file =>
      fs.readFile(path.join(programDir, file.path), 'utf8')
    )
  );
  return sources.join('\n');
}

describe('Regressions / Architecture-specific entrypoints /', () => {
  let tempDir;
  let buildOutputDir;
  let packageConfig;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp('legacy'));
    // Build the Cordova web program without requiring a native SDK.
    await fs.appendFile(path.join(tempDir, '.meteor/platforms'), '\nandroid\n');
    if (process.env.NPM_LINK_RSPACK !== 'false') {
      await linkLocalRspack(tempDir);
    }
    packageConfig = await fs.readJson(path.join(tempDir, 'package.json'));
  }, 600000);

  beforeEach(async () => {
    await fs.writeJson(path.join(tempDir, 'package.json'), packageConfig, { spaces: 2 });
  });

  afterEach(async () => {
    if (buildOutputDir) await cleanupTempDir(buildOutputDir);
    buildOutputDir = null;
  });

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  test.each([
    ['production', []],
    ['debug', ['--debug']],
  ])('%s build preserves distinct client entrypoints', async (mode, flags) => {
    if (mode === 'debug') {
      const pkg = await fs.readJson(path.join(tempDir, 'package.json'));
      const entries = pkg.meteor.mainModule;
      pkg.meteor.mainModule = {
        modern: entries.client,
        server: entries.server,
        'web.browser.legacy': entries.legacy,
        'web.cordova': entries['web.cordova'],
      };
      await fs.writeJson(path.join(tempDir, 'package.json'), pkg, { spaces: 2 });
    }
    ({ buildOutputDir } = await buildMeteorApp(tempDir, {
      commandOptions: ['--directory', '--server-only', ...flags],
    }));

    for (const [arch, entry] of [
      ['web.browser', 'modern'],
      ['web.browser.legacy', 'legacy'],
      ['web.cordova', 'cordova'],
    ]) {
      const source = await readProgramJavaScript(buildOutputDir, arch);
      const markers = [...new Set(source.match(/architecture-\w+-entry/g))];
      expect({ arch, markers }).toEqual({
        arch,
        markers: [`architecture-${entry}-entry`],
      });
    }

    if (mode === 'debug') {
      // Debug builds keep app code separate from Meteor packages, so this checks
      // the fixture's downlevel compilation without auditing every dependency.
      const appSource = await readProgramJavaScript(buildOutputDir, 'web.browser.legacy', {
        appOnly: true,
      });
      expect(appSource.includes('architecture-legacy-entry')).toBe(true);
      expect(appSource.includes('missing')).toBe(true);
      expect(() => parse(appSource, { ecmaVersion: 5 })).not.toThrow();
      // Check Rspack's output before Meteor's compiler sees it, including the
      // asynchronously loaded chunk and the Rspack runtime itself.
      const rspackSource = await fs.readFile(path.join(tempDir,
        '_build/main-prod-web-browser-legacy/client-rspack.js'), 'utf8');
      expect(() => parse(rspackSource, { ecmaVersion: 5 })).not.toThrow();
      const chunkDir = path.join(tempDir, 'public/build-chunks/web.browser.legacy');
      const chunks = (await fs.readdir(chunkDir)).filter(file => file.endsWith('.js'));
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        const source = await fs.readFile(path.join(chunkDir, chunk), 'utf8');
        expect(() => parse(source, { ecmaVersion: 5 })).not.toThrow();
      }
    }
  }, 300000);

  test('development serves and rebuilds the legacy Rspack entry separately', async () => {
    const port = await getFreePort();
    const sourcePath = path.join(tempDir, 'client/legacy.ts');
    const source = await fs.readFile(sourcePath, 'utf8');
    // Excluded architectures must not invoke their compiler, even with an entry
    // that cannot be built. The production tests use the real Cordova entry.
    const pkg = await fs.readJson(path.join(tempDir, 'package.json'));
    pkg.meteor.mainModule['web.cordova'] = 'client/not-present.ts';
    await fs.writeJson(path.join(tempDir, 'package.json'), pkg, { spaces: 2 });
    let meteorProcess;
    try {
      ({ meteorProcess } = await runMeteorApp(tempDir, port, {
        commandOptions: ['--exclude-archs', 'web.cordova'],
        env: { RSPACK_DEVSERVER_PORT: String(await getFreePort()) },
        waitForOutput: 'App running at',
      }));
      await assertBrowserEntrypoints(`http://localhost:${port}/`);
      const legacyPage = await browser.newPage({ userAgent: legacyUserAgent });
      try {
        await legacyPage.goto(`http://localhost:${port}/`);
        await legacyPage.waitForSelector('#architecture-entry[data-rspack]');
        await fs.writeFile(sourcePath, source.replace('architecture-legacy-entry', 'architecture-legacy-updated'));
        await legacyPage.waitForFunction(() =>
          document.getElementById('architecture-entry')?.textContent === 'architecture-legacy-updated / missing'
        );
        expect(await legacyPage.getAttribute('#architecture-entry', 'data-rspack'))
          .toBe('RSPACK LOADER / web.browser.legacy');
      } finally {
        await legacyPage.close();
      }
    } finally {
      if (meteorProcess) await killMeteorProcess(meteorProcess);
      await fs.writeFile(sourcePath, source);
    }
  }, 300000);

  test('full-app tests combine each architecture\'s app and test entries', async () => {
    const port = await getFreePort();
    let meteorProcess;
    try {
      ({ meteorProcess } = await runMeteorTests(tempDir, port, {
        commandOptions: ['--full-app', '--exclude-archs', 'web.cordova'],
        env: { RSPACK_DEVSERVER_PORT: String(await getFreePort()) },
        waitForOutput: 'App running at',
        testClient: true,
      }));
      await assertBrowserEntrypoints(`http://localhost:${port}/`, { isTest: true });
    } finally {
      if (meteorProcess) await killMeteorProcess(meteorProcess);
    }
  }, 300000);

  test.each([
    ['disabled', false, []],
    ['unspecified', undefined, ['architecture-modern-entry']],
  ])('%s architecture entries preserve existing behavior', async (_mode, entry, expected) => {
    const packagePath = path.join(tempDir, 'package.json');
    const pkg = await fs.readJson(packagePath);
    pkg.meteor.mainModule.legacy = entry;
    pkg.meteor.mainModule['web.cordova'] = entry;
    await fs.writeJson(packagePath, pkg, { spaces: 2 });

    ({ buildOutputDir } = await buildMeteorApp(tempDir, {
      commandOptions: ['--directory', '--server-only'],
    }));
    for (const arch of ['web.browser', 'web.browser.legacy', 'web.cordova']) {
      const source = await readProgramJavaScript(buildOutputDir, arch);
      const markers = [...new Set(source.match(/architecture-\w+-entry/g))];
      expect({ arch, markers }).toEqual({
        arch,
        markers: arch === 'web.browser' ? ['architecture-modern-entry'] : expected,
      });
    }
  }, 300000);
});

describe('Regressions / Legacy npm dependencies /', () => {
  let tempDir;
  let buildOutputDir;
  let builtApp;
  let mongo;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp('legacy'));
    // Match #14756's React app and unsupported-browser stub with shared npm
    // imports. Keep these dependencies out of the fixture's other scenarios.
    await execa('npm', ['install', '--save-exact',
      'react@19.2.0', 'react-dom@19.2.0',
      'ua-parser-js@2.0.10', '@datadog/browser-rum@7.14.0',
    ], { cwd: tempDir, stdio: 'inherit' });
    if (process.env.NPM_LINK_RSPACK !== 'false') {
      await linkLocalRspack(tempDir);
    }
    const packagePath = path.join(tempDir, 'package.json');
    const pkg = await fs.readJson(packagePath);
    pkg.meteor.mainModule = {
      client: 'client/npm-modern.tsx',
      legacy: 'client/npm-legacy.ts',
      server: 'server/main.js',
    };
    pkg.meteor.nodeModules = { recompile: { 'ua-parser-js': 'legacy' } };
    delete pkg.meteor.modern;
    await fs.writeJson(packagePath, pkg, { spaces: 2 });
    await fs.writeFile(path.join(tempDir, 'rspack.config.js'),
      "const { defineConfig } = require('@meteorjs/rspack');\n" +
      'module.exports = defineConfig(() => ({}));\n');
  }, 600000);

  afterEach(async () => {
    if (builtApp) await builtApp.stop();
    builtApp = null;
    if (mongo) await mongo.stop();
    mongo = null;
    if (buildOutputDir) await cleanupTempDir(buildOutputDir);
    buildOutputDir = null;
  });

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  test('production isolates the React app and runs the legacy npm stub', async () => {
    ({ buildOutputDir } = await buildMeteorApp(tempDir, {
      commandOptions: ['--directory', '--server-only'],
    }));
    const modernSource = await readProgramJavaScript(buildOutputDir, 'web.browser');
    const legacySource = await readProgramJavaScript(buildOutputDir, 'web.browser.legacy');
    for (const [arch, source, entry] of [
      ['web.browser', modernSource, 'modern'],
      ['web.browser.legacy', legacySource, 'legacy'],
    ]) {
      expect({ arch, markers: [...new Set(source.match(/architecture-\w+-entry/g))] })
        .toEqual({ arch, markers: [`architecture-${entry}-entry`] });
      expect({ arch, reactDOM: source.includes('react-dom'), react: source.includes('react.production') })
        .toEqual({ arch, reactDOM: entry === 'modern', react: entry === 'modern' });
    }
    mongo = await startMongo();
    expect(mongo).not.toBeNull();
    const port = await getFreePort();
    builtApp = await runBuiltApp(buildOutputDir, { port, mongoUrl: mongo.mongoUrl });
    for (const { userAgent, message, isModern } of [
      {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        message: 'Modern app / Chrome 120.0.0.0 / architecture-modern-entry',
        isModern: true,
      },
      {
        userAgent: legacyUserAgent,
        message: 'Your browser is not supported / IE 11.0 / architecture-legacy-entry',
        isModern: false,
      },
    ]) {
      const testPage = await browser.newPage({ userAgent });
      const errors = [];
      testPage.on('pageerror', error => errors.push(error.message));
      try {
        await testPage.goto(`http://localhost:${port}/`);
        try {
          await testPage.waitForFunction(() =>
            document.getElementById('architecture-entry')?.textContent.includes('architecture-')
          );
        } catch (error) {
          throw new Error(`${isModern ? 'Modern' : 'Legacy'} npm entry failed: ${errors.join('; ')}\n${error.message}`);
        }
        expect(await testPage.textContent('#architecture-entry')).toBe(message);
        expect(await testPage.evaluate(() => Meteor.isModern)).toBe(isModern);
        expect(errors).toEqual([]);
      } finally {
        await testPage.close();
      }
    }
  }, 300000);
});
