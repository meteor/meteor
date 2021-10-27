const path = require('path');
const os = require('os');

const METEOR_LATEST_VERSION = '2.5';
const sudoUser = process.env.SUDO_USER || '';
function isRoot() {
  return process.getuid && process.getuid() === 0;
}
const localAppData = process.env.LOCALAPPDATA;
const isWindows = () => os.platform() === 'win32';
const isMac = () => os.platform() === 'darwin';
const rootPath = isWindows()
  ? localAppData
  : `${isRoot() ? `/home/${sudoUser}` : os.homedir()}`;

if (isWindows() && !localAppData) {
  throw new Error('LOCALAPPDATA env var is not set.');
}

const meteorLocalFolder = '.meteor';
const meteorPath = path.resolve(rootPath, meteorLocalFolder);

module.exports = {
  extractPath: rootPath,
  meteorPath,
  release: process.env.INSTALL_METEOR_VERSION || METEOR_LATEST_VERSION,
  rootPath,
  sudoUser,
  startedPath: path.resolve(rootPath, '.meteor-install-started.txt'),
  isWindows,
  isMac,
  isRoot,
};
