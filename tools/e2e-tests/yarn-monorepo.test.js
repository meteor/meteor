import fs from 'fs-extra';
import path from 'path';
import { assertRspackWorkspaceInstall } from './assertions';
import {
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  runMeteorApp,
  runMeteorCommand,
  setupMeteorApp,
} from './helpers';

const PORT = 3134;
const DEV_SERVER_PORT = 18082;
const HOOK_TIMEOUT = process.env.CI ? 600_000 : 300_000;

describe('Yarn Monorepo Dependency Auto-install /', () => {
  let appDir;
  let meteorProcess;
  let tempDir;

  beforeAll(async () => {
    await killProcessByPort([PORT, DEV_SERVER_PORT]);

    tempDir = (
      await setupMeteorApp('monorepo', {
        isMonorepo: true,
        packageManager: 'yarn',
      })
    ).tempDir;
    appDir = path.join(tempDir, 'app');

    const packageJson = await fs.readJson(path.join(appDir, 'package.json'));
    expect(packageJson.meteor.autoInstallDeps).not.toBe(false);

    await runMeteorCommand('add', ['rspack'], appDir, {
      checkExitCode: true,
    });
  }, HOOK_TIMEOUT);

  afterAll(async () => {
    if (meteorProcess) {
      await killMeteorProcess(meteorProcess);
    }
    await killProcessByPort([PORT, DEV_SERVER_PORT]);
    await cleanupTempDir(tempDir);
  });

  test('installs Rspack dependencies in the nested app with Yarn', async () => {
    const result = await runMeteorApp(tempDir, PORT, {
      env: { RSPACK_DEVSERVER_PORT: String(DEV_SERVER_PORT) },
      isMonorepo: true,
      skipWaitOn: true,
      waitForOutput: /Installed Rspack dependencies/,
    });
    meteorProcess = result.meteorProcess;

    await assertRspackWorkspaceInstall({
      workspaceRoot: tempDir,
      appDir,
      packageManager: 'yarn',
    });
  }, HOOK_TIMEOUT);
});
