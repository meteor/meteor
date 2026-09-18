const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = function runPortableCommand() {
  return execFileSync(process.execPath, [path.join(__dirname, 'node_modules/.bin/relative')], {
    encoding: 'utf8',
  });
};
