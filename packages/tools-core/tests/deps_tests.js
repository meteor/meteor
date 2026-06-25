import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  detectMissingOrOutdatedDeps,
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
        [{ name: 'foo', version: '1.0.0' }],
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
  'tools-core - hasMeteorAppConfigAutoInstallDeps default is true',
  function (test) {
    test.isTrue(typeof hasMeteorAppConfigAutoInstallDeps === 'function');
  },
);
