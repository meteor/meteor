import { Tinytest } from 'meteor/tinytest';

import {
  _buildNpmInstallArgs,
} from 'meteor/tools-core/lib/npm';

Tinytest.add('tools-core - npm - install args can preserve dev dependencies', test => {
  const args = _buildNpmInstallArgs('@capacitor/core@^7.4.3', {
    includeDev: true,
  });

  test.equal(args, [
    'install',
    '--include=dev',
    '@capacitor/core@^7.4.3',
  ]);
});

Tinytest.add('tools-core - npm - meteor command install args can preserve dev dependencies', test => {
  const args = _buildNpmInstallArgs(['@capacitor/core@^7.4.3'], {
    includeDev: true,
    isMeteorCommand: true,
  });

  test.equal(args, [
    'npm',
    'install',
    '--include=dev',
    '@capacitor/core@^7.4.3',
  ]);
});
