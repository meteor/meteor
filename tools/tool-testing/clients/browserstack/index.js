import Client from '../../client.js';
import configuredClients from "./clients.js";
import { enterJob } from '../../../utils/buildmessage.js';
import { execFileAsync, execFileSync } from '../../../utils/processes';
import { ensureDependencies } from '../../../cli/dev-bundle-helpers.js';
import {
  mkdtemp,
  pathJoin,
  readFile,
} from '../../../fs/files';

const NPM_DEPENDENCIES = {
  'selenium-webdriver': '4.1.1',
  'browserstack-local': '1.4.8',
};

const USER = 'dev1141';

// A memoized key from BrowserStackClient._getBrowserStackKey.
let browserStackKey;

export default class BrowserStackClient extends Client {
  constructor(options) {
    super(options);
  }
  async init() {
    await enterJob(
      {
        title: "Installing BrowserStack WebDriver in Meteor tool",
      },
      () => ensureDependencies(NPM_DEPENDENCIES)
    );
    this.npmPackageExports = require("selenium-webdriver");

    // Capabilities which are allowed by selenium.
    this.config.seleniumOptions = this.config.seleniumOptions || {};

    // Additional capabilities which are unique to BrowserStack.
    this.config.browserStackOptions = this.config.browserStackOptions || {};

    this._setName();
  }

  _setName() {
    const name = this.config.seleniumOptions.browserName || "default";
    const version = this.config.seleniumOptions.version || "";
    const device =
      (this.config.browserStackOptions.realMobile &&
        this.config.browserStackOptions.device) ||
      "";

    this.name =
      "BrowserStack: " +
      name +
      (version && ` Version ${version}`) +
      (device && ` (Device: ${device})`);
  }

  connect() {

    const triggerRequest = (key) => {
      const capabilities = {
        // Authentication
        "browserstack.user": USER,
        "browserstack.key": key,
        // Use the BrowserStackLocal tunnel, to allow BrowserStack to
        // tunnel to the machine this server is running on.
        "browserstack.local": true,

        // Enabled the capturing of "Visual Logs" (i.e. Screenshots).
        "browserstack.debug": true,

        // On browsers that support it, capture the console
        "browserstack.console": "errors",

        ...this.config.seleniumOptions,
        ...this.config.browserStackOptions,
      };
      this.driver = new this.npmPackageExports.Builder()
        .usingServer("https://hub-cloud.browserstack.com/wd/hub")
        .withCapabilities(capabilities)
        .build();

      return this.driver.get(this.url);
    };

    this._launchBrowserStackTunnel()
      .then(key => triggerRequest(key))
      .catch((e) => {
        // In the event of an error, shut down the daemon.
        this.stop();

        throw e;
      });
  }

  stop() {
    this.driver && this.driver.quit();
    this.driver = null;

    this.tunnelProcess && this.tunnelProcess.stop(() => {});
    this.tunnelProcess = null;
  }

  /**
   *
   * @returns {Promise<string>} The BrowserStack key.
   */
  static async _getBrowserStackKey() {
    // Use the memoized version, first and foremost.
    if (typeof browserStackKey !== "undefined") {
      return browserStackKey;
    }

    if (process.env.BROWSERSTACK_ACCESS_KEY) {
      return (browserStackKey = process.env.BROWSERSTACK_ACCESS_KEY);
    }

    // Try to get the credentials from S3 with the s3cmd tool.
    const outputDir = pathJoin(mkdtemp(), "key");
    const browserstackKey = "s3://meteor-browserstack-keys/browserstack-key";
    try {
      await execFileAsync("s3cmd", ["get", browserstackKey, outputDir]);

      return (browserStackKey = readFile(outputDir, "utf8").trim());
    } catch (e) {
      // A failure is acceptable here; it was just a try.
      console.warn(
        `Failed to load browserstack key from 
        ${browserstackKey}`,
        e
      );
    }

    return (browserStackKey = null);
  }

  /**
   *
   * @returns {Promise<string>} The BrowserStack key.
   */
  _launchBrowserStackTunnel() {
    this.tunnelProcess = new (require("browserstack-local").Local)();
    /**
     * @returns {Promise<string>} The BrowserStack key.
     */
    const getKey = () => this.constructor._getBrowserStackKey();

    return new Promise((resolve, reject) => {
      getKey().then((key) => {
        if (!key) {
          throw new Error(
            "BrowserStack key not found. Ensure that s3cmd is setup with " +
              "S3 credentials, or set BROWSERSTACK_ACCESS_KEY in your environment."
          );
        }
        const options = {
          key: key,
          onlyAutomate: true,
          verbose: true,
          // The ",0" means "SSL off".  It's localhost, after all.
          only: `${this.host},${this.port},0`,
        };
        this.tunnelProcess.start(options, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(key);
          }
        });
      });
    });
  }

  static async prerequisitesMet() {
    return !!(await this._getBrowserStackKey());
  }

  static pushClients(clients, appConfig) {
    configuredClients.forEach((client) => {
      clients.push(
        new BrowserStackClient({
          ...appConfig,
          config: {
            seleniumOptions: client.selenium,
            browserStackOptions: client.browserstack,
          },
        })
      );
    });
  }
}
