const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  createLocalPackageLinkPlan,
  createLocalModernToolsLinkPlan,
} = require('./link-modern-tools.js');

test('local package linker accepts arbitrary package specs without name inference', () => {
  assert.deepEqual(createLocalPackageLinkPlan({
    destinationRoot: '/app',
    packageSpecs: {
      '@example/runner': { source: '/repo/runner', save: 'dev' },
      '@example/compiler': { source: '/repo/compiler', save: 'prod' },
    },
  }), [
    {
      command: 'npm',
      args: [
        'install', '--save-dev', '--no-package-lock', '--install-links=false', '/repo/runner',
      ],
      cwd: '/app',
    },
    {
      command: 'npm',
      args: [
        'install', '--save', '--no-package-lock', '--install-links=false', '/repo/compiler',
      ],
      cwd: '/app',
    },
  ]);
});

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
