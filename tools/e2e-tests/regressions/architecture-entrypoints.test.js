import path from 'path';
import fs from 'fs-extra';
import { parse } from 'acorn';
import {
  buildMeteorApp,
  cleanupTempDir,
  getFreePort,
  killMeteorProcess,
  runMeteorApp,
  runMeteorTests,
  setupMeteorApp,
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
