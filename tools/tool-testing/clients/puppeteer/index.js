import { execFile } from 'child_process';
import { mkdirSync, rmSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Client from '../../client.js';
import { enterJob } from '../../../utils/buildmessage.js';
import { ensureDependencies } from '../../../cli/dev-bundle-helpers.js';
import { getDevBundle, pathJoin, statOrNull } from '../../../fs/files';

const NPM_DEPENDENCIES = {
  puppeteer: '25.9.0'
};
const PUPPETEER_CACHE_DIR = join(tmpdir(), 'puppeteer-chrome-cache-25.9.0');
const PUPPETEER_CACHE_LOCK_DIR = `${PUPPETEER_CACHE_DIR}.lock`;
const BROWSER_CHECK_TIMEOUT_MS = 30000;
const INSTALL_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const INSTALL_LOCK_HEARTBEAT_MS = 30000;
const STALE_INSTALL_LOCK_MS = 2 * 60 * 1000;

function runFile(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default class PuppeteerClient extends Client {
  constructor(options) {
    super(options);

    this.name = 'Puppeteer';
    this.initialized = false;
  }

  async init () {
    process.env.PUPPETEER_CACHE_DIR = PUPPETEER_CACHE_DIR;

    await enterJob(
      {
        title: 'Installing Puppeteer in Meteor tool'
      },
      () => {
        return ensureDependencies(NPM_DEPENDENCIES, {
          reinstallOnVersionMismatch: true
        });
      }
    );

    this.npmPackageExports = require('puppeteer');

    await enterJob(
      {
        title: 'Installing Chrome for Puppeteer'
      },
      () => this._ensureBrowserDownloaded()
    );

    this.initialized = true;
  }

  async _ensureBrowserDownloaded() {
    if (await this._browserExecutablePath()) {
      return;
    }

    await this._acquireBrowserInstallLock();
    const lockHeartbeat = setInterval(() => {
      try {
        const now = new Date();
        utimesSync(PUPPETEER_CACHE_LOCK_DIR, now, now);
      } catch {
        // Lock cleanup below reports the meaningful installation outcome.
      }
    }, INSTALL_LOCK_HEARTBEAT_MS);

    try {
      // Another process may have completed the installation just before this
      // process acquired the lock.
      if (await this._browserExecutablePath()) {
        return;
      }

      // Puppeteer's installer treats an existing browser directory as a
      // completed install. Clear a partial cache before trying again.
      rmSync(PUPPETEER_CACHE_DIR, { force: true, recursive: true });

      const installer = pathJoin(
        getDevBundle(),
        'lib',
        'node_modules',
        'puppeteer',
        'install.mjs'
      );

      await runFile(process.execPath, [installer], {
        env: {
          ...process.env,
          PUPPETEER_CACHE_DIR,
          PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD: 'true'
        }
      });

      if (!await this._browserExecutablePath()) {
        throw new Error('Chrome for Puppeteer is unavailable after installation');
      }
    } finally {
      clearInterval(lockHeartbeat);
      rmSync(PUPPETEER_CACHE_LOCK_DIR, { force: true, recursive: true });
    }
  }

  async _acquireBrowserInstallLock() {
    const deadline = Date.now() + INSTALL_LOCK_TIMEOUT_MS;

    while (true) {
      try {
        mkdirSync(PUPPETEER_CACHE_LOCK_DIR);
        return true;
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }

      const lockStat = statOrNull(PUPPETEER_CACHE_LOCK_DIR);
      if (lockStat && Date.now() - lockStat.mtimeMs > STALE_INSTALL_LOCK_MS) {
        rmSync(PUPPETEER_CACHE_LOCK_DIR, { force: true, recursive: true });
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for another Puppeteer installation');
      }

      await wait(100);
    }
  }

  async _browserExecutablePath() {
    let executablePath;
    try {
      executablePath = await this.npmPackageExports.executablePath();
    } catch {
      return null;
    }

    const executableStat = executablePath && statOrNull(executablePath);
    if (!executableStat || !executableStat.isFile()) {
      return null;
    }

    try {
      await runFile(executablePath, ['--version'], {
        timeout: BROWSER_CHECK_TIMEOUT_MS,
        windowsHide: true
      });
      return executablePath;
    } catch {
      return null;
    }
  }

  _checkInitialized() {
    if (!this.initialized) {
      throw new Error('PuppeteerClient not initialized');
    }
  }

  async connect() {
    this._checkInitialized();

    // From a security perspective this is not ideal, in the future would be worthwhile
    // to configure to include only for CI based setups
    this.browser = await this.npmPackageExports.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
    const client = new PuppeteerClient(appConfig);
    await client.init();

    clients.push(client);
  }
}
