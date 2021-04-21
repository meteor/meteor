const path = require('path');

const METEOR_LATEST_VERSION = '2.2';

const localAppData = process.env.LOCALAPPDATA;

if (!localAppData) {
  throw new Error('LOCALAPPDATA env var is not set.');
}

const meteorLocalFolder = '.meteor';
const meteorPath = path.resolve(localAppData, meteorLocalFolder);

module.exports = {
  extractPath: localAppData,
  meteorPath,
  release: process.env.INSTALL_METEOR_VERSION || METEOR_LATEST_VERSION,
  startedPath: path.resolve(localAppData, '.meteor-install-started.txt'),
}
