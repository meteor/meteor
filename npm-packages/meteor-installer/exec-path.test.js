const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isMeteorOnPath, appendLineIfMissing } = require('./exec-path');

test('isMeteorOnPath finds meteor already on PATH', () => {
  const meteor = '/home/u/.meteor';
  assert.equal(isMeteorOnPath(`/usr/bin:${meteor}:/bin`, meteor, ':'), true);
  assert.equal(isMeteorOnPath('/usr/bin:/bin', meteor, ':'), false);
  assert.equal(isMeteorOnPath('', meteor, ':'), false);
  assert.equal(isMeteorOnPath(undefined, meteor, ':'), false);
  // a prefix match must not count as present
  assert.equal(isMeteorOnPath('/home/u/.meteorx:/bin', meteor, ':'), false);
});

test('appendLineIfMissing appends once and is idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-path-'));
  const file = path.join(dir, '.bashrc');
  const line = 'export PATH=/home/u/.meteor:$PATH';
  try {
    fs.writeFileSync(file, '# existing\n');
    assert.equal(appendLineIfMissing(file, line), true, 'writes when missing');
    assert.equal(appendLineIfMissing(file, line), false, 'skips when present');
    const occurrences = fs.readFileSync(file, 'utf8').split(line).length - 1;
    assert.equal(occurrences, 1, 'the line appears exactly once');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('appendLineIfMissing creates a missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-path-'));
  const file = path.join(dir, '.zshrc');
  const line = 'export PATH=/home/u/.meteor:$PATH';
  try {
    assert.equal(appendLineIfMissing(file, line), true);
    assert.equal(fs.readFileSync(file, 'utf8'), `${line}\n`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
