import path from 'path';
import fs from 'fs';
import os from 'os';

import { runMeteorCommand, cleanupTempDir } from './helpers';

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
    const { appName, tempDir } = tempApp('example');
    try {
      await runMeteorCommand(
        'create', ['--example', 'tic-tac-toe', appName], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from clones an external repo', async () => {
    const { appName, tempDir } = tempApp('from');
    try {
      await runMeteorCommand(
        'create', ['--from', 'https://github.com/fredmaiaarantes/simpletasks', appName], os.tmpdir(),
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
          '--from-branch', 'migrate-examples',
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
          '--from-branch', 'migrate-examples',
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
          '--from', 'https://github.com/meteor/examples/tree/migrate-examples/parties',
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
