import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';

const execa = require('execa');

import {
  runMeteorCommand,
  runMeteorApp,
  killMeteorProcess,
  killStrayAppProcesses,
  cleanupTempDir,
} from './helpers';

function tempApp(prefix) {
  const suffix = Math.random().toString(36).substring(2, 10);
  const appName = `meteortest-add-${prefix}-${suffix}`;
  return { appName, tempDir: path.join(os.tmpdir(), appName) };
}

async function createBaseApp(prefix) {
  const { appName, tempDir } = tempApp(prefix);
  await runMeteorCommand(
    'create', [appName, '--bare'], os.tmpdir(),
    { checkExitCode: true }
  );
  return { appName, tempDir };
}

async function copyBaseApp(baseDir, prefix) {
  const app = tempApp(prefix);
  await fs.promises.cp(baseDir, app.tempDir, {
    recursive: true,
    filter(source) {
      const relativePath = path.relative(baseDir, source);
      return relativePath !== 'node_modules' &&
        !relativePath.startsWith(`node_modules${path.sep}`) &&
        relativePath !== path.join('.meteor', 'local') &&
        !relativePath.startsWith(`${path.join('.meteor', 'local')}${path.sep}`);
    },
  });
  return app;
}

describe('CLI / Add --from /', () => {
  let baseAppDir;

  beforeAll(async () => {
    baseAppDir = (await createBaseApp('base')).tempDir;
  }, 600_000);

  afterEach(async () => {
    await killStrayAppProcesses();
  });

  afterAll(async () => {
    await killStrayAppProcesses();
    await cleanupTempDir(baseAppDir);
  });

  describe('argument validation', () => {
    it('--from-branch without --from errors', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'vbranch');
      try {
        await expect(runMeteorCommand(
          'add', ['--from-branch', 'main'], tempDir,
          { captureOutput: true, checkExitCode: true }
        )).rejects.toThrow();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('--from-dir without --from errors', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'vdir');
      try {
        await expect(runMeteorCommand(
          'add', ['--from-dir', 'sub'], tempDir,
          { captureOutput: true, checkExitCode: true }
        )).rejects.toThrow();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('--force without --from errors', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'vforce');
      try {
        await expect(runMeteorCommand(
          'add', ['--force'], tempDir,
          { captureOutput: true, checkExitCode: true }
        )).rejects.toThrow();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('--to without --from errors', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'vto');
      try {
        await expect(runMeteorCommand(
          'add', ['--to', 'packages/foo'], tempDir,
          { captureOutput: true, checkExitCode: true }
        )).rejects.toThrow();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('--from rejects positional package args', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'vargs');
      try {
        await expect(runMeteorCommand(
          'add', ['--from', 'owner/repo', 'some-package'], tempDir,
          { captureOutput: true, checkExitCode: true }
        )).rejects.toThrow();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('--search rejects Git clone options', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'vsearch');
      try {
        await expect(runMeteorCommand(
          'add', [
            '--search', 'accounts',
            '--from', 'owner/repo',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        )).rejects.toThrow();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe('cloning', () => {
    it('meteor add --from clones a package from a Git URL', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'url');
      try {
        await runMeteorCommand(
          'add', [
            '--from',
            'https://github.com/Meteor-Community-Packages/meteor-publish-composite',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        );
        const pkg = path.join(tempDir, 'packages', 'meteor-publish-composite', 'package.js');
        expect(fs.existsSync(pkg)).toBe(true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('meteor add infers --from for GitHub shorthand owner/repo', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'shorthand');
      try {
        await runMeteorCommand(
          'add', [
            'Meteor-Community-Packages/meteor-publish-composite',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        );
        const pkg = path.join(tempDir, 'packages', 'meteor-publish-composite', 'package.js');
        expect(fs.existsSync(pkg)).toBe(true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('meteor add infers --from for a GitHub tree URL with subdirectory', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'tree');
      try {
        // meteor/blaze hosts multiple packages under packages/<name>/package.js;
        // a tree URL with subdir should auto-extract that single package.
        await runMeteorCommand(
          'add', [
            'https://github.com/meteor/blaze/tree/master/packages/blaze',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        );
        const pkg = path.join(tempDir, 'packages', 'blaze', 'package.js');
        expect(fs.existsSync(pkg)).toBe(true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('meteor add --from with --from-dir extracts a subdirectory', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'fromdir');
      try {
        await runMeteorCommand(
          'add', [
            '--from', 'https://github.com/meteor/blaze',
            '--from-branch', 'master',
            '--from-dir', 'packages/blaze',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        );
        const pkg = path.join(tempDir, 'packages', 'blaze', 'package.js');
        expect(fs.existsSync(pkg)).toBe(true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('meteor add --from --to writes to a custom destination', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'to');
      try {
        await runMeteorCommand(
          'add', [
            '--from',
            'Meteor-Community-Packages/meteor-publish-composite',
            '--to', 'packages/custom-name',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        );
        const pkg = path.join(tempDir, 'packages', 'custom-name', 'package.js');
        expect(fs.existsSync(pkg)).toBe(true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('meteor add --from --force overwrites an existing destination', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'force');
      try {
        await runMeteorCommand(
          'add', [
            '--from',
            'Meteor-Community-Packages/meteor-publish-composite',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        );
        // Re-clone with --force; without --force this would prompt.
        await runMeteorCommand(
          'add', [
            '--from',
            'Meteor-Community-Packages/meteor-publish-composite',
            '--force',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        );
        const pkg = path.join(tempDir, 'packages', 'meteor-publish-composite', 'package.js');
        expect(fs.existsSync(pkg)).toBe(true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('meteor add --from fails for a repo without package.js', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'nopkg');
      try {
        await expect(runMeteorCommand(
          'add', [
            '--from', 'https://github.com/meteor/examples',
            '--from-branch', 'main',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        )).rejects.toThrow();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    // End-to-end smoke: clone a tiny package via --from from a local git repo
    // (hermetic, no network), wire it into .meteor/packages, then run the app
    // and wait for a sentinel log emitted by the package's server module.
    it('app loads a package cloned via --from at startup', async () => {
      const { tempDir } = await copyBaseApp(baseAppDir, 'loadpkg');
      const SENTINEL = 'PACKAGE_FROM_SMOKETEST_LOADED';
      const port = 3050;
      let pkgRepoDir;
      let meteorProcess;
      try {
        // 1) Build a tiny Meteor package on disk and turn its dir into a git repo
        const suffix = Math.random().toString(36).substring(2, 10);
        pkgRepoDir = path.join(os.tmpdir(), `meteor-pkg-fixture-${suffix}`);
        fs.mkdirSync(pkgRepoDir, { recursive: true });
        fs.writeFileSync(
          path.join(pkgRepoDir, 'package.js'),
          "Package.describe({ name: 'local:smoketest', version: '1.0.0' });\n" +
          "Package.onUse(function(api) {\n" +
          "  api.use('ecmascript');\n" +
          "  api.mainModule('main.js', 'server');\n" +
          "});\n"
        );
        fs.writeFileSync(
          path.join(pkgRepoDir, 'main.js'),
          `console.log('${SENTINEL}');\n`
        );
        const gitEnv = ['-c', 'user.email=t@t', '-c', 'user.name=t'];
        execFileSync('git', ['init', '-q'], { cwd: pkgRepoDir });
        execFileSync('git', [...gitEnv, 'add', '.'], { cwd: pkgRepoDir });
        execFileSync('git', [...gitEnv, 'commit', '-q', '-m', 'init'], { cwd: pkgRepoDir });

        // 2) Install npm deps so the copied fixture is runnable
        await execa.command('npm install', {
          cwd: tempDir,
          shell: true,
          stdio: 'inherit',
        });

        // 3) Clone and register the package via meteor add using a
        //    file:// git URL. The package is read from Package.describe and
        //    appended to .meteor/packages automatically.
        await runMeteorCommand(
          'add', [
            `file://${pkgRepoDir}`,
            '--to', 'packages/smoketest',
          ], tempDir,
          { captureOutput: true, checkExitCode: true }
        );
        expect(fs.existsSync(
          path.join(tempDir, 'packages', 'smoketest', 'package.js')
        )).toBe(true);
        const packagesFile = fs.readFileSync(
          path.join(tempDir, '.meteor', 'packages'),
          'utf8'
        );
        expect(packagesFile.split(/\r?\n/)).toContain('local:smoketest');

        // 4) Run the app and wait for the sentinel log
        const result = await runMeteorApp(tempDir, port, {
          waitForOutput: SENTINEL,
          skipWaitOn: true,
        });
        meteorProcess = result.meteorProcess;
      } finally {
        if (meteorProcess) await killMeteorProcess(meteorProcess);
        if (pkgRepoDir) await cleanupTempDir(pkgRepoDir);
        await cleanupTempDir(tempDir);
      }
    }, 360_000);
  });
});
