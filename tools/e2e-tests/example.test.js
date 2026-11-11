import path from 'path';
import fs from 'fs';
import os from 'os';
import { pathToFileURL } from 'url';
import execa from 'execa';

import { runMeteorCommand, cleanupTempDir } from './helpers';

// Keep checkout tests on fixtures whose package constraints support Meteor 3.4.
const EXAMPLES_REF = '51987235640a212e64d6c01518703cf197ae8530';
const SIMPLE_TASKS_REPO = 'https://github.com/fredmaiaarantes/simpletasks';
const SIMPLE_TASKS_REF = '88b572234aa9caf8a7d7255421b9bda1a3759695';

function tempApp(prefix) {
  const suffix = Math.random().toString(36).substring(2, 10);
  const appName = `meteortest-${prefix}-${suffix}`;
  return { appName, tempDir: path.join(os.tmpdir(), appName) };
}

describe('Examples /', () => {
  it('meteor create --list returns available examples', async () => {
    const { processResult } = await runMeteorCommand(
      'create', ['--list'], os.tmpdir(),
      { captureOutput: true, checkExitCode: true }
    );
    expect(processResult.outputLines.join('\n')).toMatch(/Meteor Examples/);
  });

  it('meteor create --example creates a Meteor app', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'meteortest-example-'));
    const fixtureRepo = path.join(tempDir, 'simpletasks');
    try {
      await execa('git', ['init', '--quiet', fixtureRepo]);
      await execa('git', ['fetch', '--quiet', '--depth', '1', SIMPLE_TASKS_REPO, SIMPLE_TASKS_REF], {
        cwd: fixtureRepo,
        env: { GIT_TERMINAL_PROMPT: '0' }
      });
      await execa('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: fixtureRepo });

      // Keep the catalog lookup live and pin its repository only for this command.
      const configIndex = Number(process.env.GIT_CONFIG_COUNT ?? 0);
      await runMeteorCommand(
        'create', ['--example', 'simple-tasks', 'app'], tempDir,
        {
          checkExitCode: true,
          env: {
            GIT_CONFIG_COUNT: String(configIndex + 1),
            [`GIT_CONFIG_KEY_${configIndex}`]: `url.${pathToFileURL(fixtureRepo).href}.insteadOf`,
            [`GIT_CONFIG_VALUE_${configIndex}`]: SIMPLE_TASKS_REPO
          }
        }
      );
      expect(fs.existsSync(path.join(tempDir, 'app', '.meteor'))).toBe(true);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from clones an external repo', async () => {
    const { appName, tempDir } = tempApp('from');
    try {
      await runMeteorCommand(
        'create', [
          '--from', SIMPLE_TASKS_REPO,
          '--from-branch', SIMPLE_TASKS_REF,
          appName
        ], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from with --from-branch and --from-dir extracts a subdirectory', async () => {
    const { appName, tempDir } = tempApp('fromdir');
    try {
      await runMeteorCommand(
        'create', [
          '--from', 'https://github.com/meteor/examples',
          '--from-branch', EXAMPLES_REF,
          '--from-dir', 'parties',
          appName
        ], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from with --from-dir fails for non-existing directory', async () => {
    const { appName, tempDir } = tempApp('baddir');
    try {
      await expect(runMeteorCommand(
        'create', [
          '--from', 'https://github.com/meteor/examples',
          '--from-branch', EXAMPLES_REF,
          '--from-dir', 'this-dir-does-not-exist',
          appName
        ], os.tmpdir(),
        { captureOutput: true, checkExitCode: true }
      )).rejects.toThrow();
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from parses a GitHub tree URL (branch auto-detected)', async () => {
    const { appName, tempDir } = tempApp('fromurl');
    try {
      await runMeteorCommand(
        'create', [
          '--from', 'https://github.com/meteor/meteor3-react/tree/3.4-rspack',
          appName
        ], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from parses a GitHub tree URL with subdirectory', async () => {
    const { appName, tempDir } = tempApp('fromurldir');
    try {
      await runMeteorCommand(
        'create', [
          '--from', `https://github.com/meteor/examples/tree/${EXAMPLES_REF}/parties`,
          appName
        ], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from with explicit --from-branch overrides parsed branch', async () => {
    const { appName, tempDir } = tempApp('fromoverride');
    try {
      // The URL points to tree/3.4-rspack, but --from-branch overrides it
      await runMeteorCommand(
        'create', [
          '--from', 'https://github.com/meteor/meteor3-react/tree/3.4-rspack',
          '--from-branch', '3.4-rspack',
          appName
        ], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from fails for a non-Meteor repository', async () => {
    const { appName, tempDir } = tempApp('nonmeteor');
    try {
      await expect(runMeteorCommand(
        'create', [
          '--from', 'https://github.com/meteor/meteor',
          appName
        ], os.tmpdir(),
        { captureOutput: true, checkExitCode: true }
      )).rejects.toThrow();
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
