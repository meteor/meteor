import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';

describe('Vue App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'vue',
    port: 3132,
    filePaths: { 
      client: 'client/main.js', 
      server: 'server/main.js',
      test: 'tests/main.js'
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
