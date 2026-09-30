import fs from 'fs-extra';
import path from 'path';

import {
  assertConsoleEval,
  assertFileExist,
  assertMeteorApp,
} from './assertions';
import { waitForMeteorOutput } from './helpers';
import { testMeteorRspackBundler } from './test-helpers';

const CLIENT_BUNDLE_IMPORT = "import './client-rspack.js';";
const BLAZE_HTML_IMPORT = /^import ['"].*\.html['"];$/m;
const CLIENT_BOOT_MARKER = '__CLIENT_BOOTED__';

// Adapted from the issue #14561 reproduction
// client bundle loads before Blaze HTML imports
async function assertTestClientImportOrder(tempDir) {
  const wrapperPath = path.join(tempDir, '_build/app-test/client-meteor.js');
  await assertFileExist(tempDir, '_build/app-test/client-meteor.js', {
    content: CLIENT_BUNDLE_IMPORT,
  });

  const wrapper = await fs.readFile(wrapperPath, 'utf8');
  const htmlImportIndex = wrapper.search(BLAZE_HTML_IMPORT);
  const bundleImportIndex = wrapper.indexOf(CLIENT_BUNDLE_IMPORT);

  expect(htmlImportIndex).toBeGreaterThanOrEqual(0);
  expect(bundleImportIndex).toBeGreaterThan(htmlImportIndex);
}

async function assertBuiltClientContainsBootMarker(buildOutputDir) {
  const webProgramDir = path.join(
    buildOutputDir,
    'bundle/programs/web.browser'
  );
  const program = await fs.readJson(path.join(webProgramDir, 'program.json'));
  const clientScripts = program.manifest.filter(({ type }) => type === 'js');
  const scriptContents = await Promise.all(
    clientScripts.map(({ path: scriptPath }) =>
      fs.readFile(path.join(webProgramDir, scriptPath), 'utf8')
    )
  );

  expect(scriptContents.some(content => content.includes(CLIENT_BOOT_MARKER)))
    .toBe(true);
}

async function assertBlazeRouterApp(port) {
  await assertMeteorApp(port, {
    title: 'blaze-router',
    h1: 'Welcome to Meteor!',
  });
  await assertConsoleEval('window.__CLIENT_BOOTED__', true);
  await assertConsoleEval(
    "['home', 'item.detail', 'guarded'].every(name => Boolean(Router.routes[name]))",
    true
  );
  await assertConsoleEval(
    "Boolean(document.querySelector('#app-layout'))",
    true
  );
  await assertConsoleEval(
    "Boolean(document.querySelector('#home-route'))",
    true
  );
  await assertConsoleEval(
    "document.querySelector('#greeting')?.textContent",
    'client booted'
  );

  await assertRoutingScenarios(port);
}

async function assertRoutingScenarios(port) {
  const navigationToken = await page.evaluate(() => {
    window.__ROUTER_NAVIGATION_TOKEN__ = Math.random().toString(36);
    return window.__ROUTER_NAVIGATION_TOKEN__;
  });

  await page.click('#item-link');
  await assertPageText('#item-id', '42');
  await assertPageText('#item-filter', 'active');
  await assertPageText('#item-hash', 'details');
  expect(await page.evaluate(() => window.__ROUTER_NAVIGATION_TOKEN__))
    .toBe(navigationToken);

  await page.reload();
  await assertPageText('#item-id', '42');
  await assertPageText('#item-filter', 'active');
  await assertPageText('#item-hash', 'details');
  await assertConsoleEval('window.__CLIENT_BOOTED__', true);

  await page.click('#guarded-link');
  await assertPageText('#guarded-route', 'admin');
  await assertConsoleEval('window.__ROUTE_HOOK_SECTION__', 'admin');

  await page.goBack();
  await assertPageText('#item-id', '42');

  await page.evaluate(() => Router.go('/missing-route'));
  await assertPageText('#not-found-route', 'Route not found');
  expect(page.url()).toBe(`http://localhost:${port}/missing-route`);
}

async function assertPageText(selector, expectedText) {
  await page.waitForSelector(selector);
  expect(await page.$eval(selector, element => element.textContent))
    .toBe(expectedText);
}

describe('Blaze Router Integration /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'blaze-router',
    port: 3123,
    testFullApp: true,
    filePaths: {
      client: 'client/main.js',
      server: 'server/main.js',
      testClient: 'client/main.js',
      testServer: 'tests/server/main.js',
    },
    customAssertions: {
      afterRun: async ({ port }) => {
        await assertBlazeRouterApp(port);
      },
      afterRunProduction: async ({ port }) => {
        await assertBlazeRouterApp(port);
      },
      afterTest: async ({ tempDir, port }) => {
        await assertTestClientImportOrder(tempDir);
        await assertBlazeRouterApp(port);
      },
      afterTestOnce: async ({ tempDir, result }) => {
        await assertTestClientImportOrder(tempDir);
        await waitForMeteorOutput(
          result.outputLines,
          /.*loads the Rspack client bundle.*/
        );
        await waitForMeteorOutput(
          result.outputLines,
          /.*registers the Router route matrix.*/
        );
      },
      afterBuild: async ({ buildOutputDir }) => {
        await assertBuiltClientContainsBootMarker(buildOutputDir);
      },
    },
  }));
});
