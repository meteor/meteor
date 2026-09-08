import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  detectMissingOrOutdatedDeps,
  ensurePackageDependencies,
  formatInstallCommands,
} from '../lib/deps.js';
import { hasMeteorAppConfigAutoInstallDeps } from '../lib/meteor.js';

function withTempApp(fixture, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-core-deps-'));
  try {
    if (fixture) {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify(fixture, null, 2),
      );
    }
    return fn(dir);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  }
}

Tinytest.add(
  'tools-core - detectMissingOrOutdatedDeps - missing dep is reported as missing',
  function (test) {
    withTempApp({ name: 'app' }, (cwd) => {
      const out = detectMissingOrOutdatedDeps(
        [{ name: 'foo', version: '1.0.0', dev: true }],
        { cwd },
      );
      test.equal(out.length, 1);
      test.equal(out[0].name, 'foo');
      test.equal(out[0].status, 'missing');
      test.equal(out[0].requiredVersion, '1.0.0');
      test.isNull(out[0].currentVersion);
      test.isTrue(out[0].dev);
    });
  },
);

Tinytest.add(
  'tools-core - detectMissingOrOutdatedDeps - up-to-date dep is reported as ok',
  function (test) {
    withTempApp(
      { name: 'app', devDependencies: { foo: '^1.2.3' } },
      (cwd) => {
        const out = detectMissingOrOutdatedDeps(
          [{ name: 'foo', version: '1.0.0', dev: true }],
          { cwd },
        );
        test.equal(out[0].status, 'ok');
        test.equal(out[0].currentVersion, '1.2.3');
      },
    );
  },
);

Tinytest.add(
  'tools-core - detectMissingOrOutdatedDeps - older dep is reported as outdated with currentVersion',
  function (test) {
    withTempApp(
      { name: 'app', devDependencies: { foo: '0.9.0' } },
      (cwd) => {
        const out = detectMissingOrOutdatedDeps(
          [{ name: 'foo', version: '1.0.0', dev: true }],
          { cwd },
        );
        test.equal(out[0].status, 'outdated');
        test.equal(out[0].currentVersion, '0.9.0');
        test.equal(out[0].requiredVersion, '1.0.0');
      },
    );
  },
);

Tinytest.add(
  'tools-core - detectMissingOrOutdatedDeps - existenceOnly skips version comparison',
  function (test) {
    withTempApp(
      { name: 'app', dependencies: { foo: '0.0.1' } },
      (cwd) => {
        const out = detectMissingOrOutdatedDeps(
          [{ name: 'foo', version: '99.0.0', dev: false, existenceOnly: true }],
          { cwd },
        );
        test.equal(out[0].status, 'ok');
        test.isFalse(out[0].dev);
      },
    );
  },
);

Tinytest.add(
  'tools-core - detectMissingOrOutdatedDeps - missing package.json returns all missing',
  function (test) {
    withTempApp(null, (cwd) => {
      const out = detectMissingOrOutdatedDeps(
        [{ name: 'foo', version: '1.0.0', dev: false }],
        { cwd },
      );
      test.equal(out[0].status, 'missing');
    });
  },
);

Tinytest.add(
  'tools-core - formatInstallCommands - dev only emits a single --save-dev command',
  function (test) {
    const cmds = formatInstallCommands({
      changes: [
        { name: 'a', requiredVersion: '1.0.0', dev: true, status: 'missing' },
        { name: 'b', requiredVersion: '2.0.0', dev: true, status: 'outdated' },
      ],
    });
    test.equal(
      cmds.devCommand,
      'meteor npm install --save-dev a@1.0.0 b@2.0.0',
    );
    test.isUndefined(cmds.regularCommand);
  },
);

Tinytest.add(
  'tools-core - formatInstallCommands - regular only emits --save command',
  function (test) {
    const cmds = formatInstallCommands({
      changes: [
        { name: 'a', requiredVersion: '1.0.0', dev: false, status: 'missing' },
      ],
    });
    test.equal(cmds.regularCommand, 'meteor npm install --save a@1.0.0');
    test.isUndefined(cmds.devCommand);
  },
);

Tinytest.add(
  'tools-core - formatInstallCommands - mixed emits both commands',
  function (test) {
    const cmds = formatInstallCommands({
      changes: [
        { name: 'a', requiredVersion: '1.0.0', dev: true, status: 'missing' },
        { name: 'b', requiredVersion: '2.0.0', dev: false, status: 'missing' },
      ],
    });
    test.equal(cmds.devCommand, 'meteor npm install --save-dev a@1.0.0');
    test.equal(cmds.regularCommand, 'meteor npm install --save b@2.0.0');
  },
);

Tinytest.add(
  'tools-core - formatInstallCommands - yarn variant uses yarn add',
  function (test) {
    const cmds = formatInstallCommands({
      yarn: true,
      changes: [
        { name: 'a', requiredVersion: '1.0.0', dev: true, status: 'missing' },
        { name: 'b', requiredVersion: '2.0.0', dev: false, status: 'missing' },
      ],
    });
    test.equal(cmds.devCommand, 'yarn add --dev a@1.0.0');
    test.equal(cmds.regularCommand, 'yarn add b@2.0.0');
  },
);

Tinytest.add(
  'tools-core - formatInstallCommands - ok rows are filtered out',
  function (test) {
    const cmds = formatInstallCommands({
      changes: [
        { name: 'a', requiredVersion: '1.0.0', dev: true, status: 'ok' },
        { name: 'b', requiredVersion: '2.0.0', dev: true, status: 'outdated' },
      ],
    });
    test.equal(cmds.devCommand, 'meteor npm install --save-dev b@2.0.0');
  },
);

Tinytest.add(
  'tools-core - detectMissingOrOutdatedDeps - dependency type is required',
  function (test) {
    withTempApp({ name: 'app' }, (cwd) => {
      test.throws(
        () => detectMissingOrOutdatedDeps(
          [{ name: 'foo', version: '1.0.0' }],
          { cwd },
        ),
        /must set dev to true or false/,
      );
    });
  },
);

Tinytest.add(
  'tools-core - hasMeteorAppConfigAutoInstallDeps default is true',
  function (test) {
    test.isTrue(typeof hasMeteorAppConfigAutoInstallDeps === 'function');
    withTempApp({ name: 'app' }, (cwd) => {
      test.isTrue(hasMeteorAppConfigAutoInstallDeps({ cwd }));
    });
  },
);

Tinytest.addAsync(
  'tools-core - ensurePackageDependencies reads autoInstallDeps from cwd',
  async function (test) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-core-deps-'));
    const processCwd = path.join(root, 'process-app');
    const disabledCwd = path.join(root, 'disabled-app');
    const enabledCwd = path.join(root, 'enabled-app');
    const binDir = path.join(root, 'bin');
    const originalCwd = process.cwd();
    const originalPath = process.env.PATH;
    const originalYarnEnabled = process.env.YARN_ENABLED;
    const hadPlugin = Object.hasOwn(globalThis, 'Plugin');
    const originalPlugin = globalThis.Plugin;
    const hadGetCurrentNodeBinDir = Object.hasOwn(globalThis, 'getCurrentNodeBinDir');
    const originalGetCurrentNodeBinDir = globalThis.getCurrentNodeBinDir;

    try {
      [processCwd, disabledCwd, enabledCwd, binDir].forEach((dir) => {
        fs.mkdirSync(dir);
      });
      fs.writeFileSync(
        path.join(processCwd, 'package.json'),
        JSON.stringify({ name: 'process-app', meteor: { autoInstallDeps: true } }),
      );
      fs.writeFileSync(
        path.join(disabledCwd, 'package.json'),
        JSON.stringify({ name: 'disabled-app', meteor: { autoInstallDeps: false } }),
      );
      fs.writeFileSync(
        path.join(enabledCwd, 'package.json'),
        JSON.stringify({ name: 'enabled-app', meteor: { autoInstallDeps: true } }),
      );

      const meteorCommand = process.platform === 'win32' ? 'meteor.cmd' : 'meteor';
      fs.writeFileSync(
        path.join(binDir, meteorCommand),
        process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n',
      );
      if (process.platform !== 'win32') {
        fs.chmodSync(path.join(binDir, meteorCommand), 0o755);
      }

      process.chdir(processCwd);
      process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
      process.env.YARN_ENABLED = 'false';
      globalThis.Plugin = {};
      globalThis.getCurrentNodeBinDir = undefined;

      const disabled = await ensurePackageDependencies({
        packageId: 'cwd-auto-install-disabled',
        packageLabel: 'Disabled app',
        dependencies: [{ name: 'test-dependency', version: '1.0.0', dev: false }],
        cwd: disabledCwd,
      });
      test.equal(disabled.mode, 'manual-warning');
      test.isFalse(disabled.installed);

      fs.writeFileSync(
        path.join(processCwd, 'package.json'),
        JSON.stringify({ name: 'process-app', meteor: { autoInstallDeps: false } }),
      );
      const enabled = await ensurePackageDependencies({
        packageId: 'cwd-auto-install-enabled',
        packageLabel: 'Enabled app',
        dependencies: [{ name: 'test-dependency', version: '1.0.0', dev: false }],
        cwd: enabledCwd,
      });
      test.equal(enabled.mode, 'auto-install');
      test.isTrue(enabled.installed);
    } finally {
      process.chdir(originalCwd);
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalYarnEnabled === undefined) {
        delete process.env.YARN_ENABLED;
      } else {
        process.env.YARN_ENABLED = originalYarnEnabled;
      }
      if (hadPlugin) {
        globalThis.Plugin = originalPlugin;
      } else {
        delete globalThis.Plugin;
      }
      if (hadGetCurrentNodeBinDir) {
        globalThis.getCurrentNodeBinDir = originalGetCurrentNodeBinDir;
      } else {
        delete globalThis.getCurrentNodeBinDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
