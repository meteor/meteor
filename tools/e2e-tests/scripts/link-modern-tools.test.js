const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  createLocalModernToolsLinkPlan,
} = require('./link-modern-tools.js');

test('local mirror persists Rspack and Rstest specs in app package metadata', () => {
  const repoRoot = path.resolve('/repo');
  const appDir = path.resolve('/app');
  const plan = createLocalModernToolsLinkPlan({
    repoRoot,
    appDir,
    rspackVersion: '2.1.8',
  });

  assert.deepEqual(plan, [
    {
      command: path.join(repoRoot, 'meteor'),
      args: ['update', '--npm'],
      cwd: appDir,
    },
    {
      command: 'npm',
      args: [
        'install',
        '@rspack/core@2.1.8',
        '@rspack/cli@2.1.8',
        '--no-save',
        '--no-package-lock',
      ],
      cwd: path.join(repoRoot, 'npm-packages/meteor-rspack'),
    },
    {
      command: 'npm',
      args: ['install', '--no-package-lock'],
      cwd: path.join(repoRoot, 'npm-packages/meteor-rstest'),
    },
    {
      command: 'npm',
      args: [
        'install',
        '--no-save',
        '--no-package-lock',
        '--install-links=false',
        path.join(repoRoot, 'npm-packages/meteor-rspack'),
      ],
      cwd: path.join(repoRoot, 'npm-packages/meteor-rstest'),
    },
    {
      command: 'npm',
      args: ['install', 'ignore-loader', '--save'],
      cwd: appDir,
    },
    {
      command: 'npm',
      args: [
        'install',
        '--save-dev',
        '--no-package-lock',
        '--install-links=false',
        path.join(repoRoot, 'npm-packages/meteor-rstest'),
      ],
      cwd: appDir,
    },
    {
      command: 'npm',
      args: [
        'install',
        '--save',
        '--no-package-lock',
        '--install-links=false',
        path.join(repoRoot, 'npm-packages/meteor-rspack'),
      ],
      cwd: appDir,
    },
  ]);
});

test('Rspack-only mirror never installs or links Rstest', () => {
  const repoRoot = path.resolve('/repo');
  const appDir = path.resolve('/app');
  const plan = createLocalModernToolsLinkPlan({
    repoRoot,
    appDir,
    rspackVersion: '2.1.8',
    includeRstest: false,
  });

  assert.deepEqual(plan, [
    { command: path.join(repoRoot, 'meteor'), args: ['update', '--npm'], cwd: appDir },
    {
      command: 'npm',
      args: [
        'install', '@rspack/core@2.1.8', '@rspack/cli@2.1.8', '--no-save', '--no-package-lock',
      ],
      cwd: path.join(repoRoot, 'npm-packages/meteor-rspack'),
    },
    { command: 'npm', args: ['install', 'ignore-loader', '--save'], cwd: appDir },
    {
      command: 'npm',
      args: [
        'install', '--save', '--no-package-lock', '--install-links=false',
        path.join(repoRoot, 'npm-packages/meteor-rspack'),
      ],
      cwd: appDir,
    },
  ]);
});
