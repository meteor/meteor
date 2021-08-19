const path = require('path');
const os = require('os');

const METEOR_LATEST_VERSION = '2.3.5';

const localAppData = process.env.LOCALAPPDATA;
const isWindows = () => os.platform === 'win32';
const rootPath = isWindows() ? localAppData : os.homedir();
function isRoot() {
  return process.getuid && process.getuid() === 0;
}

if (isWindows() && !localAppData) {
  throw new Error('LOCALAPPDATA env var is not set.');
}

const meteorLocalFolder = '.meteor';
const meteorPath = path.resolve(rootPath, meteorLocalFolder);

module.exports = {
  extractPath: rootPath,
  meteorPath,
  release: process.env.INSTALL_METEOR_VERSION || METEOR_LATEST_VERSION,
  startedPath: path.resolve(rootPath, '.meteor-install-started.txt'),
  isWindows,
  isRoot,
};
