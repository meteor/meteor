import { execFile } from 'child_process';
import Client from '../client.js';
import { enterJob } from '../../utils/buildmessage.js';
import { getUrlWithResuming } from '../../utils/http-helpers.js';
import { execFileSync } from '../../utils/processes.js';
import { ensureDependencies } from '../../cli/dev-bundle-helpers.js';
import {
  mkdtemp,
  pathJoin,
  chmod,
  statOrNull,
  readFile,
  createWriteStream,
  getDevBundle,
} from '../../fs/files.js';

const NPM_DEPENDENCIES = {
  'browserstack-webdriver': '2.41.1',
};

// BrowserStackClient
let browserStackKey = null;

export default class BrowserStackClient extends Client {
  constructor(options) {
    super(options);

    enterJob({
      title: 'Installing BrowserStack WebDriver in Meteor tool',
    }, () => {
      ensureDependencies(NPM_DEPENDENCIES);
    });

    this.npmPackageExports = require('browserstack-webdriver');

    this.tunnelProcess = null;
    this.driver = null;

    this.browserName = options.browserName;
    this.browserVersion = options.browserVersion;

    this.name = "BrowserStack - " + this.browserName;
    if (this.browserVersion) {
      this.name += " " + this.browserVersion;
    }
  }

  connect() {
    // memoize the key
    if (browserStackKey === null) {
      browserStackKey = BrowserStackClient._getBrowserStackKey();
    }
    if (! browserStackKey) {
      throw new Error("BrowserStack key not found. Ensure that you " +
        "have installed your S3 credentials.");
    }

    const capabilities = {
      'browserName': this.browserName,
      'browserstack.user': 'meteor',
      'browserstack.local': 'true',
      'browserstack.key': browserStackKey
    };

    if (this.browserVersion) {
      capabilities.browserVersion = this.browserVersion;
    }

    this._launchBrowserStackTunnel((error) => {
      if (error) {
        throw error;
      }

      this.driver = new this.npmPackageExports.Builder().
        usingServer('http://hub.browserstack.com/wd/hub').
        withCapabilities(capabilities).
        build();

      this.driver.get(this.url);
    });
  }

  stop() {
    this.tunnelProcess && this.tunnelProcess.kill();
    this.tunnelProcess = null;

    this.driver && this.driver.quit();
    this.driver = null;
  }

  static _getBrowserStackKey() {
    const outputDir = pathJoin(mkdtemp(), "key");

    try {
      execFileSync("s3cmd", ["get",
        "s3://meteor-browserstack-keys/browserstack-key",
        outputDir
      ]);

      return readFile(outputDir, "utf8").trim();
    } catch (e) {
      return null;
    }
  }

  _launchBrowserStackTunnel(callback) {
    const browserStackPath = ensureBrowserStack();

    const args = [
      browserStackPath,
      browserStackKey,
      [this.host, this.port, 0].join(','),
      // Disable Live Testing and Screenshots, just test with Automate.
      '-onlyAutomate',
      // Do not wait for the server to be ready to spawn the process.
      '-skipCheck'
    ];
    this.tunnelProcess = execFile(
      '/usr/bin/env',
      ['bash', '-c', args.join(' ')]
    );

    // Called when the SSH tunnel is established.
    this.tunnelProcess.stdout.on('data', (data) => {
      if (data.toString().match(/You can now access your local server/)) {
        callback();
      }
    });
  }
}

function ensureBrowserStack() {
  const browserStackPath = pathJoin(
    getDevBundle(),
    'bin',
    'BrowserStackLocal',
  );

  const browserStackStat = statOrNull(browserStackPath);
  if (! browserStackStat) {
    const host = "browserstack-binaries.s3.amazonaws.com";
    const OS = process.platform === "darwin" ? "osx" : "linux";
    const ARCH = process.arch === "x64" ? "x86_64" : "i686";
    const tarGz = `BrowserStackLocal-07-03-14-${OS}-${ARCH}.gz`;
    const url = `https:\/\/${host}/${tarGz}`;

    enterJob("downloading BrowserStack binaries", () => {
      return new Promise((resolve, reject) => {
        const browserStackStream =
          createWriteStream(browserStackPath);

        browserStackStream.on("error", reject);
        browserStackStream.on("end", resolve);

        const gunzip = require("zlib").createGunzip();
        gunzip.pipe(browserStackStream);
        gunzip.write(getUrlWithResuming(url));
        gunzip.end();
      }).await();
    });
  }

  chmod(browserStackPath, 0o755);

  return browserStackPath;
}
