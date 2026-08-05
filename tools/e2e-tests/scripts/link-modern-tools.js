#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const execa = require('execa');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONSTANTS_PATH = path.join(REPO_ROOT, 'packages', 'rspack', 'lib', 'constants.js');

function readRspackVersion(repoRoot = REPO_ROOT) {
  const constantsPath = path.join(repoRoot, 'packages', 'rspack', 'lib', 'constants.js');
  const source = fs.readFileSync(constantsPath, 'utf8');
  const match = source.match(/DEFAULT_RSPACK_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error(`Unable to read DEFAULT_RSPACK_VERSION from ${constantsPath}`);
  return match[1];
}

function createLocalModernToolsLinkPlan({
  repoRoot = REPO_ROOT,
  appDir,
  rspackVersion,
  includeRstest = true,
}) {
  const meteor = path.join(repoRoot, 'meteor');
  const rspackDir = path.join(repoRoot, 'npm-packages', 'meteor-rspack');
  const rstestDir = path.join(repoRoot, 'npm-packages', 'meteor-rstest');
  const prepareRstest = includeRstest ? [
    { command: 'npm', args: ['install', '--no-package-lock'], cwd: rstestDir },
    {
      command: 'npm',
      args: [
        'install',
        '--no-save',
        '--no-package-lock',
        '--install-links=false',
        rspackDir,
      ],
      cwd: rstestDir,
    },
  ] : [];
  const persistAppRstest = includeRstest ? [{
    command: 'npm',
    args: [
      'install',
      '--save-dev',
      '--no-package-lock',
      '--install-links=false',
      rstestDir,
    ],
    cwd: appDir,
  }] : [];
  return [
    { command: meteor, args: ['update', '--npm'], cwd: appDir },
    {
      command: 'npm',
      args: [
        'install',
        `@rspack/core@${rspackVersion}`,
        `@rspack/cli@${rspackVersion}`,
        '--no-save',
        '--no-package-lock',
      ],
      cwd: rspackDir,
    },
    ...prepareRstest,
    { command: 'npm', args: ['install', 'ignore-loader', '--save'], cwd: appDir },
    ...persistAppRstest,
    {
      command: 'npm',
      args: [
        'install',
        '--save',
        '--no-package-lock',
        '--install-links=false',
        rspackDir,
      ],
      cwd: appDir,
    },
  ];
}

async function linkLocalModernTools(appDir, { env, includeRstest = true } = {}) {
  const rspackVersion = readRspackVersion();
  const plan = createLocalModernToolsLinkPlan({
    appDir,
    rspackVersion,
    includeRstest,
  });
  const execEnv = env ? { ...process.env, ...env } : undefined;

  for (const step of plan) {
    await execa(step.command, step.args, {
      cwd: step.cwd,
      env: execEnv,
      stdio: 'inherit',
    });
  }
}

module.exports = {
  CONSTANTS_PATH,
  REPO_ROOT,
  createLocalModernToolsLinkPlan,
  linkLocalModernTools,
  readRspackVersion,
};

if (require.main === module) {
  const appDir = process.argv[2];
  if (!appDir) {
    console.error('Usage: node link-modern-tools.js <appDir>');
    process.exit(1);
  }
  linkLocalModernTools(path.resolve(appDir)).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
