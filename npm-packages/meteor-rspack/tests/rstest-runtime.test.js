const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  readRstestRuntimeInventory,
} = require('../lib/rstest.js');

test('versioned runtime inventory selects exact files per architecture', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = path.join(root, 'runtime.json');
  const serverFile = path.join(root, 'imports/server.test.ts');
  const clientFile = path.join(root, 'imports/client.test.ts');
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 2,
    serverFiles: [serverFile],
    clientFiles: [clientFile],
  }));

  assert.deepEqual(readRstestRuntimeInventory({
    manifest,
    projectDir: root,
    client: false,
  }), { discoveryRoot: root, files: [serverFile] });
  assert.deepEqual(readRstestRuntimeInventory({
    manifest,
    projectDir: root,
    client: true,
  }), { discoveryRoot: root, files: [clientFile] });
});

test('legacy runtime inventory keeps legacy discovery root', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = path.join(root, 'runtime.json');
  const file = path.join(root, 'tests/rstest/runtime/server/items.test.js');
  fs.writeFileSync(manifest, JSON.stringify([file]));

  assert.deepEqual(readRstestRuntimeInventory({
    manifest,
    projectDir: root,
    client: false,
  }), {
    discoveryRoot: path.join(root, 'tests/rstest/runtime/server'),
    files: [file],
  });
});
