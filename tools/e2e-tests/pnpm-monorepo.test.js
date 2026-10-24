import path from 'path';
import fs from 'fs/promises';
import { waitForMeteorOutput } from './helpers';
import { testMeteorRspackBundler } from './test-helpers';

const SHARED_HMR_SENTINEL = 'domain:server:shared-hmr-tick';
const CLIENT_HMR_SENTINEL = '__meteorPnpmMonorepoHmrSentinel';

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
      devClient: 'ui:client:workspace package hot updated',
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

        // This browser-only state survives HMR but not a full-page reload.
        await page.evaluate(sentinel => {
          window[sentinel] = true;
        }, CLIENT_HMR_SENTINEL);
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
      afterRunRebuildClient: async () => {
        // The shared helper has observed the marker appended to the workspace
        // package. Verify Rspack applied it through HMR instead of reloading.
        const sentinelSurvived = await page.evaluate(
          sentinel => window[sentinel],
          CLIENT_HMR_SENTINEL,
        );
        expect(sentinelSurvived).toBe(true);
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
