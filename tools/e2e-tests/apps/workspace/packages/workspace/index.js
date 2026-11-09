const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = function runPortableCommand() {
  return ['relative', 'cross-relative'].map(name =>
    execFileSync(process.execPath, [path.join(__dirname, 'node_modules/.bin', name)], {
      encoding: 'utf8',
    })
  ).join(':');
};
