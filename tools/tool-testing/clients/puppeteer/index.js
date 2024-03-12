import Client from '../../client.js';
import { enterJob } from '../../../utils/buildmessage.js';
import { ensureDependencies } from '../../../cli/dev-bundle-helpers.js';

const NPM_DEPENDENCIES = {
  puppeteer: '13.2.0'
};

export default class PuppeteerClient extends Client {
  constructor(options) {
    super(options);

    this.name = 'Puppeteer';
    this.initialized = false;
  }

  async init () {
    await enterJob(
      {
        title: 'Installing Puppeteer in Meteor tool'
      },
      () => {
        return ensureDependencies(NPM_DEPENDENCIES);
      }
    );

    this.npmPackageExports = require('puppeteer');
    this.initialized = true;
  }

  _checkInitialized() {
    if (!this.initialized) {
      throw new Error('PuppeteerClient not initialized');
    }
  }

  async connect() {
    this._checkInitialized();

    // Note for Travis and CircleCI to run sandbox must be turned off.
    // From a security perspective this is not ideal, in the future would be worthwhile
    // to configure to include only for CI based setups
    this.browser = await this.npmPackageExports.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
