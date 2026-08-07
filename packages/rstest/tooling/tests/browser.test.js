const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { loadAppPlaywright, RstestBrowser } = require('../provider/browser.js');

test('app-local Playwright resolves through installed Rstest package root', t => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-browser-'));
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }));
  const rstestDir = path.join(appDir, 'node_modules/@meteorjs/rstest');
  const playwrightDir = path.join(appDir, 'node_modules/playwright');
  fs.mkdirSync(rstestDir, { recursive: true });
  fs.mkdirSync(playwrightDir, { recursive: true });
  fs.writeFileSync(
    path.join(rstestDir, 'package.json'),
    JSON.stringify({ name: '@meteorjs/rstest', version: '0.0.0-test' })
  );
  fs.writeFileSync(
    path.join(playwrightDir, 'package.json'),
    JSON.stringify({ name: 'playwright', version: '0.0.0-test', main: 'index.js' })
  );
  fs.writeFileSync(path.join(playwrightDir, 'index.js'), 'module.exports = { local: true };');

  assert.deepEqual(loadAppPlaywright(appDir), { local: true });
});

test('Meteor Rstest browser opens app with app-local Playwright and closes once', async () => {
  const calls = [];
  const page = {
    on(event) { calls.push(['on', event]); },
    async goto(url, options) { calls.push(['goto', url, options]); },
  };
  const context = {
    async addInitScript(_callback, value) { calls.push(['addInitScript', value]); },
    async newPage() { calls.push(['newPage']); return page; },
    async close() { calls.push(['closeContext']); },
  };
  const browser = {
    async newContext() { calls.push(['newContext']); return context; },
    async close() { calls.push(['closeBrowser']); },
  };
  const integration = new RstestBrowser({
    appDir: '/app',
    url: 'http://localhost:3100',
    browser: 'chromium',
    token: 'browser-token',
    loadPlaywright: () => ({
      chromium: {
        async launch(options) { calls.push(['launch', options]); return browser; },
      },
    }),
  });

  await integration.start();
  await integration.stop();
  await integration.stop();

  assert.deepEqual(calls, [
    ['launch', { headless: true }],
    ['newContext'],
    ['addInitScript', 'browser-token'],
    ['newPage'],
    ['on', 'console'],
    ['on', 'pageerror'],
    ['goto', 'http://localhost:3100', { waitUntil: 'domcontentloaded' }],
    ['closeContext'],
    ['closeBrowser'],
  ]);
});
