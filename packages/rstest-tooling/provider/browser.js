const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function loadAppPlaywright(appDir) {
  const directPackageJson = path.join(
    appDir,
    'node_modules',
    '@meteorjs',
    'rstest',
    'package.json'
  );
  let packageJson = fs.existsSync(directPackageJson)
    ? directPackageJson
    : null;
  if (!packageJson) try {
    packageJson = require.resolve('@meteorjs/rstest/package.json', {
      paths: [appDir],
    });
  } catch {
    packageJson = null;
  }
  if (!packageJson || !path.isAbsolute(packageJson) || !fs.existsSync(packageJson)) {
    throw new Error(
      '[Meteor Rstest] @meteorjs/rstest is missing; cannot launch client tests. ' +
      'Run meteor npm install --save-dev @meteorjs/rstest@0.1.0-beta.0.',
    );
  }
  return createRequire(packageJson)('playwright');
}

class RstestBrowser {
  constructor({
    appDir,
    url,
    browser = 'chromium',
    headless = true,
    loadPlaywright = loadAppPlaywright,
    log = message => console.log(message),
    token,
  }) {
    this.appDir = appDir;
    this.url = url;
    this.browserName = browser;
    this.headless = headless;
    this.loadPlaywright = loadPlaywright;
    this.log = log;
    this.token = token;
    this.browser = null;
    this.context = null;
  }

  async start() {
    if (this.browser) throw new Error('[Meteor Rstest] Client browser is already running.');
    const playwright = this.loadPlaywright(this.appDir);
    const browserType = playwright[this.browserName];
    if (!browserType) {
      throw new Error(
        `[Meteor Rstest] Unsupported client browser "${this.browserName}". ` +
        'Expected chromium, firefox, or webkit.',
      );
    }

    this.browser = await browserType.launch({ headless: this.headless });
    this.context = await this.browser.newContext();
    await this.context.addInitScript(token => {
      if (globalThis.top !== globalThis) return;
      Object.defineProperty(globalThis, '__METEOR_RSTEST_TOKEN__', {
        value: token,
        configurable: false,
        enumerable: false,
        writable: false,
      });
    }, this.token);
    const page = await this.context.newPage();
    page.on('console', message => {
      this.log(`[Meteor Rstest client] ${message.text()}`);
    });
    page.on('pageerror', error => {
      this.log(`[Meteor Rstest client] ${error.stack || error.message || error}`);
    });
    await page.goto(this.url, { waitUntil: 'domcontentloaded' });
  }

  async stop() {
    if (!this.browser) return;
    const context = this.context;
    const browser = this.browser;
    this.context = null;
    this.browser = null;
    if (context) await context.close();
    await browser.close();
  }
}

module.exports = { RstestBrowser, loadAppPlaywright };
