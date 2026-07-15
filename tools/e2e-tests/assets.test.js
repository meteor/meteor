import {
  waitForMeteorOutput,
  waitForPlaywrightConsole,
} from './helpers';
import { testMeteorRspackBundler } from './test-helpers';

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
        },
        afterBuild: async ({ buildOutputDir }) => {
          const path = require('path');
          const cp = require('child_process');
          const bundleDir = path.join(buildOutputDir, 'bundle');
          
          await new Promise((resolve, reject) => {
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
                resolve();
              }
            });
            child.stderr.on('data', data => {
              output += data.toString();
            });
            child.on('error', err => reject(err));
            child.on('exit', (code) => {
              if (code !== 0 && code !== null && !child.killed) {
                reject(new Error(`Built app exited with code ${code}. Output: ${output}`));
              }
            });
            
            setTimeout(() => {
              child.kill();
              reject(new Error('Timeout waiting for node main.js to output assets. Output: ' + output));
            }, 15000);
          });
        },
      },
    })
  );
});
