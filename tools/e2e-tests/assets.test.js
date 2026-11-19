import {
  waitForMeteorOutput,
  waitForPlaywrightConsole,
} from './helpers';
import { testMeteorRspackBundler } from './test-helpers';

// A worker created with new Worker(new URL(...)) replies and raises no error
// of its own (#15003).
const assertBundledWorker = async () => {
  await page.waitForFunction(
    () => document.querySelector('#worker-events')?.textContent.includes('message:')
  );
  const workerEvents = await page.$eval('#worker-events', el => el.textContent);
  expect(workerEvents.trim()).toBe('message: worker got ping');
};

describe('Assets App Bundling /', () => {
  describe(
    'Meteor+Rspack Bundler /',
    testMeteorRspackBundler({
      appName: 'assets',
      port: 3124,
      skipTestClient: true,
      filePaths: {
        server: 'server/main.js',
        client: 'client/main.js',
        test: 'tests/main.js',
      },
      customAssertions: {
        afterRun: async ({ result }) => {
          await waitForMeteorOutput(
            result.outputLines,
            '__PACKAGE_ASSET__=Hello from server package asset'
          );
          await waitForMeteorOutput(
            result.outputLines,
            '__APP_ASSET__=Hello from app private folder'
          );
          const clientAsset = await page.$eval('#client-asset', el => el.innerText);
          expect(clientAsset.trim()).toBe('Hello from client package asset');
          await assertBundledWorker();
        },
        afterRunProduction: async ({ result }) => {
          await waitForMeteorOutput(
            result.outputLines,
            '__PACKAGE_ASSET__=Hello from server package asset'
          );
          await waitForMeteorOutput(
            result.outputLines,
            '__APP_ASSET__=Hello from app private folder'
          );
          const clientAsset = await page.$eval('#client-asset', el => el.innerText);
          expect(clientAsset.trim()).toBe('Hello from client package asset');
          await assertBundledWorker();
        },
        afterBuild: async ({ buildOutputDir }) => {
          const path = require('path');
          const cp = require('child_process');
          const bundleDir = path.join(buildOutputDir, 'bundle');

          await new Promise((resolve, reject) => {
            let settled = false;
            let timeoutId;
            const settle = (callback, value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeoutId);
              callback(value);
            };
            const child = cp.spawn(process.execPath, ['main.js'], {
              cwd: bundleDir,
              env: {
                ...process.env,
                PORT: '3126',
                ROOT_URL: 'http://localhost:3126',
              }
            });

            let output = '';
            child.stdout.on('data', data => {
              output += data.toString();
              if (output.includes('__PACKAGE_ASSET__=Hello from server package asset') &&
                  output.includes('__APP_ASSET__=Hello from app private folder')) {
                child.kill();
                settle(resolve);
              }
            });
            child.stderr.on('data', data => {
              output += data.toString();
            });
            child.on('error', err => settle(reject, err));
            child.on('exit', (code) => {
              if (code !== 0 && code !== null && !child.killed) {
                settle(reject, new Error(
                  `Built app exited with code ${code}. Output: ${output}`,
                ));
              }
            });

            timeoutId = setTimeout(() => {
              child.kill();
              settle(reject, new Error(
                'Timeout waiting for node main.js to output assets. Output: ' + output,
              ));
            }, 15000);
          });
        },
      },
    })
  );
});
