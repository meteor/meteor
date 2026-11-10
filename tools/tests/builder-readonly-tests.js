import Builder from '../isobuild/builder.js';

var selftest = require('../tool-testing/selftest.js');
var fs = require('fs');
var path = require('path');
var os = require('os');

// A build product may resolve, through a symlink, onto a file a previous build
// left read-only. Writing over it directly fails with EACCES/EPERM; Builder#write
// must fall back to an atomic rewrite and still land the new contents.
if (process.platform !== 'win32') {
  selftest.define('builder - write recovers from a read-only symlinked target', async function () {
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-ro-'));
    try {
      var outputPath = path.join(root, 'out');
      var realDir = path.join(root, 'readonly');
      fs.mkdirSync(realDir);
      fs.writeFileSync(path.join(realDir, 'app.js'), 'OLD', { mode: 0o444 });

      var b = new Builder({ outputPath: outputPath });
      await b.init();
      // Route a build-output subpath through a symlink into the read-only tree.
      fs.symlinkSync(realDir, path.join(b.buildPath, 'sub'), 'dir');

      await b.write('sub/app.js', { data: Buffer.from('NEW') });

      await selftest.expectEqual(
        fs.readFileSync(path.join(realDir, 'app.js'), 'utf8'),
        'NEW'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
