import fs from 'fs-extra';
import path from 'path';
import {
  buildMeteorApp,
  cleanupTempDir,
  getFreePort,
  killMeteorProcess,
  resetPlaywrightPage,
  runBuiltApp,
  runMeteorCommand,
  setupMeteorApp,
  startMongo,
  waitForMeteorOutput,
} from './helpers';
import { linkLocalRspack } from './test-helpers';

async function assertLazyRoute(port, bundler, mode) {
  const initialScripts = [];
  const collectScript = response => {
    if (response.request().resourceType() === 'script') initialScripts.push(response);
  };
  page.on('response', collectScript);
  try {
    await page.goto(`http://localhost:${port}/login`);
    await page.waitForSelector('#load-tagged-route');
  } finally {
    page.off('response', collectScript);
  }
  expect(initialScripts.length).toBeGreaterThan(0);
  const before = await page.evaluate(() => ({
    controllerLoaded: window.blazeImportProbe.controllerLoaded,
    templateRegistered: window.blazeImportProbe.templateRegistered(),
  }));
  // Registration alone cannot tell whether unexecuted template code was
  // already downloaded. Check the scripts actually served on /login too.
  const initialTemplateScripts = [];
  for (const response of initialScripts) {
    if ((await response.text()).includes('Route template loaded on demand')) {
      initialTemplateScripts.push(new URL(response.url()).pathname);
    }
  }
  // Observe rendering even when the pre-import assertion would fail, so the
  // failure distinguishes eager HTML from a broken controller or template.
  await page.click('#load-tagged-route');
  await page.waitForSelector('#tagged-route-result');
  const after = await page.evaluate(() => ({
    controllerLoaded: window.blazeImportProbe.controllerLoaded,
    controllerSawTemplate: window.blazeImportProbe.controllerSawTemplate,
    templateRegistered: window.blazeImportProbe.templateRegistered(),
    text: document.querySelector('#tagged-route-result').textContent,
  }));
  console.log('Blaze dynamic import observation:', JSON.stringify({
    bundler, mode, before, initialTemplateScripts, after,
  }));
  expect(after).toEqual({
    controllerLoaded: true,
    controllerSawTemplate: true,
    templateRegistered: true,
    text: 'Route template loaded on demand',
  });
  expect({ ...before, initialTemplateScripts }).toEqual({
    controllerLoaded: false,
    templateRegistered: false,
    initialTemplateScripts: [],
  });
}

// Reproduce #14803 with FlowRouter's actual waitOn hook and paired HTML import.
describe.each([
  ['Meteor default bundler', false],
  ['Meteor+Rspack', true],
])('Full Blaze App Bundling / Dynamic route import / %s /', (label, useRspack) => {
  let tempDir;
  let meteorProcess;
  let clientSource;
  let clientModified = false;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp('full-blaze'));
    const packagePath = path.join(tempDir, 'package.json');
    const pkg = await fs.readJson(packagePath);
    pkg.meteor.modern = useRspack;
    await fs.writeJson(packagePath, pkg, { spaces: 2 });
    await fs.appendFile(path.join(tempDir, '.meteor/packages'),
      `\ndynamic-import\n${useRspack ? 'rspack\n' : ''}`);
    // Keep the fixture's Blaze/FlowRouter dependencies but isolate the route
    // from its existing eager imports and unrelated database startup code.
    await fs.writeFile(path.join(tempDir, 'server/main.js'), 'export {};\n');
    await fs.writeFile(path.join(tempDir, 'client/main.js'), `
      import { Template } from 'meteor/templating';
      import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
      import '/imports/ui/pages/import-probe/shell.html';

      window.blazeImportProbe = {
        controllerLoaded: false,
        templateRegistered: () => Boolean(Template.tagged_with_page),
      };
      FlowRouter.route('/login', {
        action() { this.render('Import_probe_layout', 'Import_probe_login'); },
      });
      FlowRouter.route('/tagged-with', {
        waitOn() { return import('/imports/ui/pages/import-probe/tagged-with-page.js'); },
        action() { this.render('Import_probe_layout', 'tagged_with_page'); },
      });
    `);
    await fs.outputFile(path.join(tempDir, 'imports/ui/pages/import-probe/shell.html'), `
      <template name="Import_probe_layout">{{> yield}}</template>
      <template name="Import_probe_login">
        <a id="load-tagged-route" href="/tagged-with">Open tagged route</a>
      </template>
    `);
    await fs.outputFile(path.join(tempDir, 'imports/ui/pages/import-probe/tagged-with-page.js'), `
      import { Template } from 'meteor/templating';
      import './shell.html';
      import './tagged-with-page.html';
      window.blazeImportProbe.controllerLoaded = true;
      window.blazeImportProbe.controllerSawTemplate = Boolean(Template.tagged_with_page);
    `);
    clientSource = await fs.readFile(path.join(tempDir, 'client/main.js'), 'utf8');
    await fs.outputFile(path.join(tempDir, 'imports/ui/pages/import-probe/tagged-with-page.html'), `
      <template name="tagged_with_page">
        <p id="tagged-route-result">Route template loaded on demand</p>
      </template>
    `);
    if (useRspack) await linkLocalRspack(tempDir);
  }, 300_000);

  afterEach(async () => {
    await resetPlaywrightPage();
    await killMeteorProcess(meteorProcess);
    meteorProcess = null;
    if (clientModified) {
      await fs.writeFile(path.join(tempDir, 'client/main.js'), clientSource);
      clientModified = false;
    }
  });

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  test.each(['development', 'production'])(
    '%s defers template registration until the route is imported',
    async mode => {
      const port = await getFreePort();
      const result = await runMeteorCommand('run', [
        '--port', String(port),
        ...(mode === 'production' ? ['--production'] : []),
      ], tempDir, {
        captureOutput: true,
        env: { RSPACK_DEVSERVER_PORT: String(await getFreePort()) },
      });
      meteorProcess = result.meteorProcess;
      await waitForMeteorOutput(result.outputLines, 'App running at', {
        meteorProcess,
        timeout: 240_000,
      });
      await assertLazyRoute(port, label, mode);

      if (useRspack && mode === 'development') {
        // Shared eager templates must remain eager, and watch rebuilds must
        // remove stale eager imports when a template becomes route-only again.
        await page.goto(`http://localhost:${port}/login`);
        await page.waitForSelector('#load-tagged-route');
        clientModified = true;
        await fs.writeFile(path.join(tempDir, 'client/main.js'), clientSource + `
          import '/imports/ui/pages/import-probe/tagged-with-page.html';
          window.blazeImportProbe.rebuild = 'eager';
        `);
        await page.waitForFunction(() => window.blazeImportProbe?.rebuild === 'eager');
        expect(await page.evaluate(() => ({
          controllerLoaded: window.blazeImportProbe.controllerLoaded,
          templateRegistered: window.blazeImportProbe.templateRegistered(),
        }))).toEqual({ controllerLoaded: false, templateRegistered: true });

        await fs.writeFile(path.join(tempDir, 'client/main.js'), clientSource +
          "\nwindow.blazeImportProbe.rebuild = 'lazy-again';\n");
        await page.waitForFunction(() => window.blazeImportProbe?.rebuild === 'lazy-again');
        expect(await page.evaluate(() => window.blazeImportProbe.templateRegistered())).toBe(false);
        await assertLazyRoute(port, label, 'development after rebuild');
      }
    },
    300_000,
  );

  if (useRspack) {
    test('built app defers templates until route navigation', async () => {
      let buildOutputDir;
      let mongo;
      let builtApp;
      try {
        ({ buildOutputDir } = await buildMeteorApp(tempDir, {
          commandOptions: ['--directory', '--server-only'],
        }));
        mongo = await startMongo();
        expect(mongo).not.toBeNull();
        const port = await getFreePort();
        builtApp = await runBuiltApp(buildOutputDir, { port, mongoUrl: mongo.mongoUrl });
        await assertLazyRoute(port, label, 'built app');
      } finally {
        await resetPlaywrightPage();
        if (builtApp) await builtApp.stop();
        if (mongo) await mongo.stop();
        if (buildOutputDir) await cleanupTempDir(buildOutputDir);
      }
    }, 300_000);
  }
});
