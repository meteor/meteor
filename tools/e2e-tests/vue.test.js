import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';
import { assertStyles } from "./assertions";

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
      afterRun: async () => {
        // Verify Tailwind styles for ".p-8" element
        await assertStyles('.p-8', {
          ['padding']: '32px',
        });
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProduction: async () => {
        // Verify Tailwind styles for ".p-8" element
        await assertStyles('.p-8', {
          ['padding']: '32px',
        });
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
    }
  }));
});
