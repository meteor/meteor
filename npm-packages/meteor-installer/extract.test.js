const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tar = require('tar');
const { extractWithTar } = require('./extract');

function fixture(t, entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-installer-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'destination');
  fs.mkdirSync(destination);
  const archive = path.join(root, 'fixture.tar');
  const chunks = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data || '');
    const header = new tar.Header({
      path: entry.path, type: entry.type || 'File',
      linkpath: entry.linkpath || '', mode: 0o755, size: data.length,
    });
    header.encode();
    chunks.push(header.block, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  fs.writeFileSync(archive, Buffer.concat(chunks));
  return { root, destination, archive };
}

test('extracts files, hardlinks and in-tree file and directory symlinks', async t => {
  const f = fixture(t, [
    { path: 'payload/', type: 'Directory' },
    { path: 'payload/file', data: 'meteor-runtime' },
    { path: 'hard', type: 'Link', linkpath: 'payload/file' },
    { path: 'copy', type: 'SymbolicLink', linkpath: 'payload/file' },
    { path: 'directory', type: 'SymbolicLink', linkpath: 'payload' },
  ]);
  await extractWithTar(f.archive, f.destination, () => {});
  for (const name of ['payload/file', 'hard', 'copy', 'directory/file']) {
    assert.equal(fs.readFileSync(path.join(f.destination, name), 'utf8'), 'meteor-runtime');
  }
});

test('rejects traversal without writing outside the destination', async t => {
  const f = fixture(t, [{ path: '../outside', data: 'overwrite' }]);
  await assert.rejects(extractWithTar(f.archive, f.destination, () => {}));
  assert.equal(fs.existsSync(path.join(f.root, 'outside')), false);
});

test('rejects a symlink pointing outside without copying private data', async t => {
  const f = fixture(t, [{ path: 'copy', type: 'SymbolicLink', linkpath: '../outside' }]);
  fs.writeFileSync(path.join(f.root, 'outside'), 'private');
  await assert.rejects(extractWithTar(f.archive, f.destination, () => {}));
  assert.equal(fs.existsSync(path.join(f.destination, 'copy')), false);
  assert.equal(fs.readFileSync(path.join(f.root, 'outside'), 'utf8'), 'private');
});

test('rejects symlink targets that escape through an existing directory link', async t => {
  const f = fixture(t, [{ path: 'copy', type: 'SymbolicLink', linkpath: 'external/private' }]);
  fs.mkdirSync(path.join(f.root, 'external'));
  fs.writeFileSync(path.join(f.root, 'external/private'), 'private');
  fs.symlinkSync(path.join(f.root, 'external'), path.join(f.destination, 'external'), 'junction');
  await assert.rejects(extractWithTar(f.archive, f.destination, () => {}));
  assert.equal(fs.existsSync(path.join(f.destination, 'copy')), false);
});
