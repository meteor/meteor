import {
  waitForMeteorOutput,
} from './helpers';
import { testMeteorRspackBundler } from './test-helpers';

describe('Other / Server-only App Bundling /', () => {
  describe(
    'Meteor+Rspack Bundler /',
    testMeteorRspackBundler({
      appName: 'server-only',
      port: 3123,
      skipClient: true,
      skipTestClient: true,
      filePaths: {
        server: 'server/main.js',
      },
      customAssertions: {
        afterRun: async ({ result }) => {
          await waitForMeteorOutput(
            result.outputLines,
            'server/main.js loaded'
          );
        },
      },
    })
  );
});
