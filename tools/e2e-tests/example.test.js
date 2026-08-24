import path from 'path';
import fs from 'fs';
import os from 'os';

import { runMeteorCommand, cleanupTempDir } from './helpers';

const METEOR_EXAMPLES_BRANCH = process.env.METEOR_EXAMPLES_BRANCH || 'main';
const METEOR_EXAMPLES_TREE_URL =
  `https://github.com/meteor/examples/tree/${encodeURIComponent(METEOR_EXAMPLES_BRANCH)}`;
const SIMPLETASKS_REPOSITORY_URL = 'https://github.com/fredmaiaarantes/simpletasks';
const METEOR_SIMPLETASKS_BRANCH = process.env.METEOR_SIMPLETASKS_BRANCH;
const SIMPLETASKS_SOURCE_URL = METEOR_SIMPLETASKS_BRANCH
  ? `${SIMPLETASKS_REPOSITORY_URL}/tree/${encodeURIComponent(METEOR_SIMPLETASKS_BRANCH)}`
  : SIMPLETASKS_REPOSITORY_URL;
const METEOR3_REACT_REPOSITORY_URL = 'https://github.com/meteor/meteor3-react';
const METEOR_METEOR3_REACT_BRANCH =
  process.env.METEOR_METEOR3_REACT_BRANCH || '3.4-rspack';
const METEOR3_REACT_TREE_URL =
  `${METEOR3_REACT_REPOSITORY_URL}/tree/${encodeURIComponent(METEOR_METEOR3_REACT_BRANCH)}`;

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

  it('meteor create --example uses METEOR_EXAMPLES_BRANCH for internal examples', async () => {
    const { appName, tempDir } = tempApp('example-branch');
    try {
      await runMeteorCommand(
        'create', ['--example', 'tic-tac-toe', appName], os.tmpdir(),
        {
          checkExitCode: true,
          env: { METEOR_EXAMPLES_BRANCH: 'codex/typescript-7-examples' },
        }
      );
      expect(fs.readFileSync(path.join(tempDir, '.meteor', 'packages'), 'utf8'))
        .toContain('typescript@7.0.2');
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create uses the configured Simpletasks branch', async () => {
    const { appName, tempDir } = tempApp('from');
    try {
      await runMeteorCommand(
        'create', [appName, SIMPLETASKS_SOURCE_URL], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
      if (METEOR_SIMPLETASKS_BRANCH) {
        expect(fs.readFileSync(path.join(tempDir, '.meteor', 'versions'), 'utf8'))
          .toContain('typescript@7.0.2');
      }
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
          '--from-branch', METEOR_EXAMPLES_BRANCH,
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
          '--from', METEOR3_REACT_TREE_URL,
          appName
        ], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
      if (process.env.METEOR_METEOR3_REACT_BRANCH) {
        expect(fs.readFileSync(path.join(tempDir, '.meteor', 'versions'), 'utf8'))
          .toContain('typescript@7.0.2');
      }
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it('meteor create --from parses a GitHub tree URL with subdirectory', async () => {
    const { appName, tempDir } = tempApp('fromurldir');
    try {
      await runMeteorCommand(
        'create', [
          '--from', `${METEOR_EXAMPLES_TREE_URL}/parties`,
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
          '--from-branch', METEOR_METEOR3_REACT_BRANCH,
          appName
        ], os.tmpdir(),
        { checkExitCode: true }
      );
      expect(fs.existsSync(path.join(tempDir, '.meteor'))).toBe(true);
      if (process.env.METEOR_METEOR3_REACT_BRANCH) {
        expect(fs.readFileSync(path.join(tempDir, '.meteor', 'versions'), 'utf8'))
          .toContain('typescript@7.0.2');
      }
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
