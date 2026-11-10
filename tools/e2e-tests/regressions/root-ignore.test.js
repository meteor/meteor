import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import { cleanupTempDir, killMeteorProcess, runMeteorCommand } from '../helpers';
import { linkLocalRspack } from '../test-helpers';

describe('Regressions / Rspack root-scoped ignores /', () => {
  let appDir;
  let meteorProcess;
  let packageJson;

  beforeAll(async () => {
    appDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meteortest-root-ignore-'));
    packageJson = {
      name: 'root-ignore-regression',
      private: true,
      dependencies: {
        '@babel/runtime': '^7.23.5',
        '@swc/helpers': '^0.5.17',
        'meteor-node-stubs': '^1.2.13',
      },
      devDependencies: { playwright: require('playwright/package.json').version },
      meteor: {
        modern: true,
        mainModule: { client: 'client/main.js', server: 'server/main.js' },
      },
    };
    await fs.writeJson(path.join(appDir, 'package.json'), packageJson, { spaces: 2 });
    await fs.outputFile(path.join(appDir, '.meteor/packages'),
      'meteor-base\necmascript\nmodules\nrspack\nmeteortesting:mocha@3.4.0\n');
    await fs.outputFile(path.join(appDir, '.meteor/release'), 'none\n');
    await fs.outputFile(path.join(appDir, 'client/main.js'), 'export {};\n');
    await fs.outputFile(path.join(appDir, 'server/main.js'), 'export {};\n');
    // test/ holds data that stays excluded; tests/ holds the Mocha test below.
    // Rspack generates test/** to exclude the data from Meteor's source scan.
    // Meteor must still load _build/test/ entry points and execute that test (#14514).
    await fs.outputFile(path.join(appDir, 'test/data.js'),
      'throw new Error("test data must not be eagerly loaded");\n');
    await fs.outputFile(path.join(appDir, 'tests/root-ignore.test.js'), `
      import assert from 'assert';
      import { Meteor } from 'meteor/meteor';
      it('executes the root-ignore regression', function () {
        assert.strictEqual(Meteor.isTest, true);
      });
    `);
    // Release-branch CI disables local Rspack linking. Install the app's
    // runtime and browser-driver dependencies independently of that helper.
    const install = await runMeteorCommand('npm', ['install'], appDir);
    meteorProcess = install.meteorProcess;
    await meteorProcess;
    await linkLocalRspack(appDir);
    // Preserve the dependencies installed by the local Rspack helper.
    packageJson = await fs.readJson(path.join(appDir, 'package.json'));
  }, 300_000);

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    meteorProcess = null;
  });

  afterAll(async () => {
    await cleanupTempDir(appDir);
  });

  test.each(['explicit client testModule', 'eager server test discovery'])(
    'runs meteor test --once with a root test/ folder using %s',
    async mode => {
      const config = structuredClone(packageJson);
      const testClient = mode === 'explicit client testModule';
      if (testClient) {
        config.meteor.testModule = { client: 'tests/root-ignore.test.js', server: false };
      }
      await fs.writeJson(path.join(appDir, 'package.json'), config, { spaces: 2 });

      const result = await runMeteorCommand('test', [
        '--port', '3158', '--driver-package', 'meteortesting:mocha', '--once',
      ], appDir, {
        captureOutput: true,
        env: {
          ROOT_URL: 'http://localhost:3158',
          TEST_CLIENT: testClient ? '1' : '0',
          TEST_SERVER: testClient ? '0' : '1',
          TEST_BROWSER_DRIVER: 'playwright',
          RSPACK_DEVSERVER_PORT: '18158',
        },
      });
      meteorProcess = result.meteorProcess;
      const completed = await meteorProcess;
      expect(completed.exitCode).toBe(0);
      expect(completed.stdout).toContain('executes the root-ignore regression');
      expect(completed.stdout).toMatch(/\b1 passing\b/);
      expect(completed.stdout).not.toMatch(/\b0 passing\b/);
    },
  );
});
