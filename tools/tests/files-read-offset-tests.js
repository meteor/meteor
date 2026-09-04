import { readBufferWithLengthAndOffset } from '../fs/files';

var selftest = require('../tool-testing/selftest.js');
var fs = require('fs');
var path = require('path');
var os = require('os');

// readBufferWithLengthAndOffset must read `length` bytes starting at `offset`
// within the file (isopack resources are concatenated into one file, each at a
// byte offset). A non-zero offset must not overflow the buffer or read from the
// wrong position.
selftest.define('files - readBufferWithLengthAndOffset reads from a non-zero offset', async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-offset-'));
  try {
    const file = path.join(dir, 'concat.bin');
    fs.writeFileSync(file, 'AAAABBBB');
    await selftest.expectEqual(readBufferWithLengthAndOffset(file, 4, 0).toString(), 'AAAA');
    await selftest.expectEqual(readBufferWithLengthAndOffset(file, 4, 4).toString(), 'BBBB');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
