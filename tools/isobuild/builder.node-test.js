require('../tool-env/install-babel.js');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const files = require('../fs/files');
const Builder = require('./builder').default;

test('prefixed copy has the requested final mode', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-builder-copy-'));
  const source = path.join(root, 'source');
  const builder = new Builder({ outputPath: path.join(root, 'output') });

  try {
    fs.writeFileSync(source, 'body');
    await builder.init();

    for (const executable of [false, true]) {
      const name = executable ? 'executable' : 'read-only';

      await builder.write(name, {
        file: source,
        copyFile: true,
        filePrefix: Buffer.from('prefix:'),
        hash: name,
        executable,
      });

      const result = path.join(builder.buildPath, name);
      assert.equal(fs.readFileSync(result, 'utf8'), 'prefix:body');
      assert.equal(fs.statSync(result).mode & 0o777, executable ? 0o555 : 0o444);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failed prefixed copy removes its temporary file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-builder-failure-'));
  const builder = new Builder({ outputPath: path.join(root, 'output') });

  try {
    await builder.init();

    await assert.rejects(
      builder.write('result', {
        file: path.join(root, 'missing'),
        copyFile: true,
        filePrefix: Buffer.from('prefix:'),
        hash: 'missing-source',
      }),
      { code: 'ENOENT' },
    );

    assert.deepEqual(fs.readdirSync(builder.buildPath), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cleanup failure preserves the original copy error', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-builder-cleanup-'));
  const builder = new Builder({ outputPath: path.join(root, 'output') });
  const unlink = files.unlink;
  const cleanupError = new Error('cleanup failed');

  try {
    await builder.init();
    files.unlink = () => { throw cleanupError; };

    await assert.rejects(
      builder.write('result', {
        file: path.join(root, 'missing'),
        copyFile: true,
        filePrefix: Buffer.from('prefix:'),
        hash: 'missing-source',
      }),
      error => {
        assert.equal(error.code, 'ENOENT');
        assert.equal(error.cleanupError, cleanupError);
        return true;
      },
    );
  } finally {
    files.unlink = unlink;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
