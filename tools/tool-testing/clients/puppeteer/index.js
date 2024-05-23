import Client from '../../client.js';
import { enterJob } from '../../../utils/buildmessage.js';
import { ensureDependencies } from '../../../cli/dev-bundle-helpers.js';

const NPM_DEPENDENCIES = {
  puppeteer: '13.2.0'
};

export default class PuppeteerClient extends Client {
  constructor(options) {
    super(options);

    enterJob(
      {
        title: 'Installing Puppeteer in Meteor tool'
      },
      () => {
        ensureDependencies(NPM_DEPENDENCIES);
      }
    );

    this.npmPackageExports = require('puppeteer');

    this.name = 'Puppeteer';
  }

  async connect() {
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

  static pushClients(clients, appConfig) {
    clients.push(new PuppeteerClient(appConfig));
  }
}
