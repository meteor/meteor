import path from 'path';
import fs from 'fs/promises';
import { waitForMeteorOutput } from './helpers';
import { testMeteorRspackBundler } from './test-helpers';

const SHARED_HMR_SENTINEL = 'domain:server:shared-hmr-tick';

describe('Pnpm Monorepo App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'pnpm-monorepo',
    port: 3134,
    isMonorepo: true,
    monorepoAppPath: 'apps/app',
    packageManager: 'pnpm',
    filePaths: {
      client: 'packages/ui/src/client.ts',
      server: 'apps/app/server/main.js',
      test: 'apps/app/tests/main.test.js',
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
        await waitForMeteorOutput(result.outputLines, /domain:server:workspace package loaded on the server/);
        await waitForMeteorOutput(result.outputLines, /@example\/server:compiled/);
        // Server resolved the `color` npm package's transitive dependency tree.
        await waitForMeteorOutput(result.outputLines, /domain:server:accent #40E0D0/);
        const statusText = await page.$eval('#workspace-status', el => el.textContent);
        expect(statusText).toContain('@example/ui');
        expect(statusText).toContain('client package compiled by Rspack');
        // Client resolved the same transitive dependency tree.
        const accentText = await page.$eval('#accent-color', el => el.textContent);
        expect(accentText).toContain('#40E0D0');
      },
      afterRunProduction: async ({ result }) => {
        await waitForMeteorOutput(result.outputLines, /domain:server:workspace package loaded on the server/);
        await waitForMeteorOutput(result.outputLines, /@example\/server:compiled/);
        await waitForMeteorOutput(result.outputLines, /domain:server:accent #40E0D0/);
        const statusText = await page.$eval('#workspace-status', el => el.textContent);
        expect(statusText).toContain('@example/ui');
        expect(statusText).toContain('client package compiled by Rspack');
        const accentText = await page.$eval('#accent-color', el => el.textContent);
        expect(accentText).toContain('#40E0D0');
      },
      afterRunBuiltApp: async () => {
        // Boot the `meteor build` output and verify the production bundle
        // actually imported the workspace packages and the `color` transitive
        // dependency tree, not just that the dev/prod-run servers did.
        const statusText = await page.$eval('#workspace-status', el => el.textContent);
        expect(statusText).toContain('@example/ui');
        expect(statusText).toContain('client package compiled by Rspack');
        const accentText = await page.$eval('#accent-color', el => el.textContent);
        expect(accentText).toContain('#40E0D0');
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // HMR transcript must name the workspace package file by its real
        // pnpm path. Catches regressions where Rspack stops watching the
        // symlinked workspace and falls back to a full reload.
        const hmrUpdate = allConsoleLogs.find(line =>
          line.includes('[HMR]') && line.includes('packages/ui/src/client.ts')
        );
        expect(hmrUpdate).toBeDefined();
      },
      afterRunRebuildServer: async ({ tempDir, result }) => {
        // Mutate a server-only workspace file to verify the server watcher
        // picks up changes inside pnpm-linked packages, not just inside the
        // app itself.
        const sharedPath = path.join(tempDir, 'packages/domain/src/index.js');
        const original = await fs.readFile(sharedPath, 'utf8');
        try {
          await fs.writeFile(
            sharedPath,
            `${original}\nconsole.log('${SHARED_HMR_SENTINEL}');\n`,
          );
          await waitForMeteorOutput(result.outputLines, SHARED_HMR_SENTINEL);
        } finally {
          await fs.writeFile(sharedPath, original);
        }
      },
      afterTest: async ({ result }) => {
        await waitForMeteorOutput(result.outputLines, /pnpm workspace packages compiled/);
        await waitForMeteorOutput(result.outputLines, /pnpm transitive dependencies resolved/);
      },
      afterTestOnce: async ({ result }) => {
        await waitForMeteorOutput(result.outputLines, /pnpm workspace packages compiled/);
        await waitForMeteorOutput(result.outputLines, /pnpm transitive dependencies resolved/);
      },
    },
  }));
});
