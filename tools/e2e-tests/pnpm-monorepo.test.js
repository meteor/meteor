import { waitForMeteorOutput } from './helpers';
import { testMeteorRspackBundler } from './test-helpers';

describe('Pnpm Monorepo App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'pnpm-monorepo',
    port: 3134,
    isMonorepo: true,
    packageManager: 'pnpm',
    filePaths: {
      client: 'packages/ui/src/client.ts',
      server: 'app/server/main.js',
      test: 'app/tests/main.test.js',
    },
    customMessages: {
      devClient: '[webpack-dev-server] App hot update',
      devServer: 'Hello from dev server',
      prodClient: 'Hello from prod client',
      prodServer: 'Hello from prod server',
      test: 'Hello from test',
      testClient: 'Hello from test client',
      testServer: 'Hello from test server',
    },
    configFile: 'rspack.config.cjs',
    customAssertions: {
      afterRun: async ({ result }) => {
        await waitForMeteorOutput(result.outputLines, /domain:server:server package loaded/);
        await waitForMeteorOutput(result.outputLines, /server-tools:compiled/);
        const statusText = await page.$eval('#workspace-status', el => el.textContent);
        expect(statusText).toContain('client-tools:compiled');
      },
      afterRunProduction: async ({ result }) => {
        await waitForMeteorOutput(result.outputLines, /domain:server:server package loaded/);
        await waitForMeteorOutput(result.outputLines, /server-tools:compiled/);
        const statusText = await page.$eval('#workspace-status', el => el.textContent);
        expect(statusText).toContain('client-tools:compiled');
      },
      afterTest: async ({ result }) => {
        await waitForMeteorOutput(result.outputLines, /pnpm workspace packages compiled/);
      },
      afterTestOnce: async ({ result }) => {
        await waitForMeteorOutput(result.outputLines, /pnpm workspace packages compiled/);
      },
    },
  }));
});
