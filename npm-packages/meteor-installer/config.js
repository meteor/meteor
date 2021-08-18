const path = require('path');
const os = require('os');

const METEOR_LATEST_VERSION = '2.3.5';

const localAppData = process.env.LOCALAPPDATA;
const PLATFORM = os.platform();
const rootPath = PLATFORM === 'win32' ? localAppData : os.homedir();

if (PLATFORM === 'win32' && !localAppData) {
  throw new Error('LOCALAPPDATA env var is not set.');
}

const meteorLocalFolder = '.meteor';
const meteorPath = path.resolve(rootPath, meteorLocalFolder);

module.exports = {
  extractPath: rootPath,
  meteorPath,
  release: process.env.INSTALL_METEOR_VERSION || METEOR_LATEST_VERSION,
  startedPath: path.resolve(rootPath, '.meteor-install-started.txt'),
}
