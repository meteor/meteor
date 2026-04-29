import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';

describe('CoffeeScript App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'coffeescript',
    port: 3132,
    filePaths: { 
      client: 'client/main.coffee', 
      server: 'server/main.coffee',
      test: 'tests/main.coffee'
    },
    customUpdates: {
      devClient: (message) => `console.log "${message}" if Meteor.isDevelopment`,
      devServer: (message) => `console.log "${message}" if Meteor.isDevelopment`,
      prodClient: (message) => `console.log "${message}" if Meteor.isProduction`,
      prodServer: (message) => `console.log "${message}" if Meteor.isProduction`,
      test: (message) => `console.log "${message}"`
    },
    customAssertions: {
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
    }
  }));
});
