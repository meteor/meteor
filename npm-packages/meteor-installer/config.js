const path = require('path');

const localAppData = process.env.LOCALAPPDATA;

if (!localAppData) {
  throw new Error('LOCALAPPDATA env var is not set.');
}

const meteorLocalFolder = '.meteor';
const meteorPath = path.resolve(localAppData, meteorLocalFolder);

module.exports = {
  extractPath: localAppData,
  meteorPath,
  release: process.env.INSTALL_METEOR_VERSION || '2.1',
  startedPath: path.resolve(localAppData, '.meteor-install-started.txt'),
}
