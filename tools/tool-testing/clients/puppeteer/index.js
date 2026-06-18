import { execFile } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import Client from '../../client.js';
import { enterJob } from '../../../utils/buildmessage.js';
import { ensureDependencies } from '../../../cli/dev-bundle-helpers.js';
import { getDevBundle, pathJoin, statOrNull } from '../../../fs/files';

// puppeteer 13.2.0 (bundled in older dev_bundles) uses the legacy BrowserFetcher
// whose download URLs no longer work on Node 24+. 23.6.0 uses @puppeteer/browsers
// and downloads a working browser.
const NPM_DEPENDENCIES = {
  puppeteer: '23.6.0'
};

// Store the Chrome binary in a temp directory that lives outside dev_bundle.
// dev_bundle is cached by CI; a browser binary inside it can end up in a
// corrupted state (directory present, binary missing) that blocks re-downloads.
// os.tmpdir() is ephemeral per CI container, so Chrome is always downloaded
// fresh — no stale-cache failures.
function puppeteerCacheDir() {
  return join(tmpdir(), 'puppeteer-chrome-cache');
}

export default class PuppeteerClient extends Client {
  constructor(options) {
    super(options);

    this.name = 'Puppeteer';
    this.initialized = false;
  }

  async init() {
    process.env.PUPPETEER_CACHE_DIR = puppeteerCacheDir();

    await enterJob(
      { title: 'Installing Puppeteer in Meteor tool' },
      () => ensureDependencies(NPM_DEPENDENCIES, { reinstallOnVersionMismatch: true })
    );

    this.npmPackageExports = require('puppeteer');

    await enterJob(
      { title: 'Ensuring Chrome for Puppeteer' },
      () => this._ensureBrowserDownloaded()
    );

    this.initialized = true;
  }

  // puppeteer's postinstall downloads the browser, but it can be skipped in CI
  // or point at a path that launch() doesn't resolve. Verify the binary is
  // present and download it explicitly if not.
  async _ensureBrowserDownloaded() {
    let execPath;
    try {
      execPath = this.npmPackageExports.executablePath();
    } catch (e) {
      execPath = null;
    }

    if (execPath && statOrNull(execPath)) {
      return;
    }

    const cli = pathJoin(
      getDevBundle(), 'lib', 'node_modules', 'puppeteer',
      'lib', 'cjs', 'puppeteer', 'node', 'cli.js'
    );

    await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [cli, 'browsers', 'install', 'chrome'],
        { env: { ...process.env, PUPPETEER_CACHE_DIR: puppeteerCacheDir() } },
        (err, _stdout, stderr) => {
          if (err) {
            reject(new Error(
              `Failed to download Chrome for Puppeteer: ${err.message}\n${stderr}`
            ));
          } else {
            resolve();
          }
        }
      );
    });
  }

  _checkInitialized() {
    if (!this.initialized) {
      throw new Error('PuppeteerClient not initialized');
    }
  }

  async connect() {
    this._checkInitialized();

    this.browser = await this.npmPackageExports.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    this.page = await this.browser.newPage();
    this.page.goto(`http://${this.host}:${this.port}`);
  }

  async stop() {
    this.page && await this.page.close();
    this.page = null;

    this.browser && await this.browser.close();
    this.browser = null;
  }

  static async pushClients(clients, appConfig) {
    let client = new PuppeteerClient(appConfig);
    await client.init();
    clients.push(client);
  }
}
