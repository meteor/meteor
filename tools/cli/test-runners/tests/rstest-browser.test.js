const assert = require('node:assert/strict');
const test = require('node:test');

const { RstestBrowser } = require('../../../runners/run-rstest-browser.js');

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
