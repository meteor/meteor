import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

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

  it('meteor create infers --from for an external URL', async () => {
    const { appName, tempDir } = tempApp('from');
    try {
      await runMeteorCommand(
        'create', [appName, 'https://github.com/fredmaiaarantes/simpletasks'], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from uses checkout packages while preserving external constraints', async () => {
    const { appName, tempDir } = tempApp('checkout');
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-create-source-'));
    const sourcePackages = [
      '# Constraints copied from a published app',
      'meteor@999.0.0 # Keep this comment',
      'check@=999.0.0',
      'random',
      'react-meteor-data@=0.2.6-beta.16',
      '',
    ].join('\n');
    try {
      fs.mkdirSync(path.join(sourceDir, '.meteor'));
      fs.writeFileSync(path.join(sourceDir, '.meteor', 'packages'), sourcePackages);
      fs.writeFileSync(path.join(sourceDir, 'package.json'), '{"private":true}\n');
      execFileSync('git', ['init', '-q'], { cwd: sourceDir });
      execFileSync('git', ['add', '.'], { cwd: sourceDir });
      execFileSync('git', [
        '-c', 'user.name=test', '-c', 'user.email=test@example.com',
        'commit', '-q', '-m', 'create app fixture',
      ], { cwd: sourceDir });

      await runMeteorCommand(
        'create', ['--from', pathToFileURL(sourceDir).href, appName], os.tmpdir(),
        { captureOutput: true, checkExitCode: true }
      );

      expect(fs.readFileSync(path.join(tempDir, '.meteor', 'packages'), 'utf8'))
        .toBe(sourcePackages.replace('meteor@999.0.0', 'meteor').replace('check@=999.0.0', 'check'));
      expect(fs.readFileSync(path.join(tempDir, '.meteor', 'release'), 'utf8').trim())
        .toBe('none');
      expect(fs.readFileSync(path.join(tempDir, '.meteor', 'versions'), 'utf8'))
        .toContain('react-meteor-data@0.2.6-beta.16\n');
      expect(fs.existsSync(path.join(tempDir, '.git'))).toBe(false);
    } finally {
      await cleanupTempDir(tempDir);
      await cleanupTempDir(sourceDir);
    }
  });

  it('meteor create --from with --from-branch and --from-dir extracts a subdirectory', async () => {
    const { appName, tempDir } = tempApp('fromdir');
    try {
      await runMeteorCommand(
        'create', [
          '--from', 'https://github.com/meteor/examples',
          '--from-branch', 'main',
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
          '--from-branch', 'main',
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
          '--from', 'https://github.com/meteor/examples/tree/main/parties',
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
