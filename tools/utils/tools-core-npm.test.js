const fs = require('fs');
const path = require('path');

jest.mock('../../packages/tools-core/lib/process', () => ({
  spawnProcess: jest.fn((_command, _args, options) => options.onExit(0)),
}));

const { spawnProcess } = require('../../packages/tools-core/lib/process');
const { installNpmDependency, getNpxCommand } = require('../../packages/tools-core/lib/npm');

afterEach(() => {
  jest.restoreAllMocks();
  spawnProcess.mockClear();
});

test('shared npm helpers use the running Node installation without a Plugin API or global Meteor', async () => {
  const binDir = path.dirname(process.execPath);
  const npmPath = path.join(binDir, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const npxPath = path.join(binDir, process.platform === 'win32' ? 'npx.cmd' : 'npx');
  jest.spyOn(fs, 'existsSync').mockImplementation(file => [npmPath, npxPath].includes(file));

  expect(await installNpmDependency(['example@1.0.0'], {
    cwd: '/test app',
    dev: true,
    exact: true,
    includeDevDependencies: true,
  })).toBe(true);
  expect(spawnProcess).toHaveBeenCalledWith(npmPath, [
    'install', '--save-dev', '--save-exact', '--production=false', 'example@1.0.0',
  ], expect.objectContaining({
    cwd: '/test app',
    env: expect.objectContaining({
      PATH: binDir + path.delimiter + (process.env.PATH || process.env.Path || ''),
      NODE_ENV: 'development',
      YARN_PRODUCTION: 'false',
    }),
  }));
  expect(getNpxCommand(['example'])).toEqual({
    command: npxPath, args: ['example'], prefix: npxPath,
  });
});

test('npm helpers retain the Meteor launcher fallback when Node has no sibling npm', async () => {
  jest.spyOn(fs, 'existsSync').mockReturnValue(false);
  expect(await installNpmDependency('example@1.0.0', { cwd: '/test app' })).toBe(true);
  expect(spawnProcess).toHaveBeenCalledWith('meteor', [
    'npm', 'install', 'example@1.0.0',
  ], expect.objectContaining({ cwd: '/test app' }));
});
