const fs = require('fs');
const path = require('path');

function ensureBuildContextFile(filePath, defaultContent) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing.includes(defaultContent)) {
      return false;
    }
  }

  fs.writeFileSync(filePath, defaultContent, 'utf8');
  if (filePath.endsWith('-rspack.js')) {
    fs.rmSync(`${filePath}.map`, { force: true });
  }
  return true;
}

module.exports = { ensureBuildContextFile };
