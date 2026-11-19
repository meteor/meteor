const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  ensureBuildContextFile,
} = require('./build-context-files.js');

test('removes a stale source map when resetting an Rspack output file', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rspack-context-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const outputPath = path.join(directory, 'server-rspack.js');
  const mapPath = `${outputPath}.map`;
  fs.writeFileSync(outputPath, 'old compiled output');
  fs.writeFileSync(mapPath, '{"version":3}');

  ensureBuildContextFile(outputPath, '/* Code generated */');

  assert.equal(fs.readFileSync(outputPath, 'utf8'), '/* Code generated */');
  assert.equal(fs.existsSync(mapPath), false);
});

test('keeps an Rspack output and source map when the placeholder is present', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rspack-context-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const outputPath = path.join(directory, 'client-rspack.js');
  const mapPath = `${outputPath}.map`;
  fs.writeFileSync(outputPath, '/* Code generated */\ncompiled output');
  fs.writeFileSync(mapPath, '{"version":3}');

  ensureBuildContextFile(outputPath, '/* Code generated */');

  assert.equal(fs.readFileSync(outputPath, 'utf8'), '/* Code generated */\ncompiled output');
  assert.equal(fs.existsSync(mapPath), true);
});
