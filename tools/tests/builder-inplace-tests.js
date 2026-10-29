import Builder from '../isobuild/builder.js';

var selftest = require('../tool-testing/selftest.js');
var fs = require('fs');
var path = require('path');
var os = require('os');

// An in-place rebuild reuses the previous build's written-hash cache. If a file
// was removed from the output directory out of band, a matching cached hash must
// not let the rebuild skip it — the file has to be rewritten.
if (process.platform !== 'win32') {
  selftest.define('builder - in-place rebuild rewrites a file removed from disk', async function () {
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-inplace-'));
    try {
      var outputPath = path.join(root, 'bundle');
      var data = Buffer.from('build product');

      // First build writes the file and finalizes it into outputPath.
      var first = new Builder({ outputPath: outputPath });
      await first.init();
      await first.write('programs/web/app.js', { data: data });
      await first.complete();

      // Second build reuses the first in place (buildPath === outputPath).
      var second = new Builder({
        outputPath: outputPath,
        previousBuilder: first,
        forceInPlaceBuild: true,
      });
      await second.init();
      await selftest.expectEqual(second.buildPath, outputPath);

      var target = path.join(outputPath, 'programs/web/app.js');
      fs.unlinkSync(target);

      // Same path and content/hash as before; must be rewritten, not skipped.
      await second.write('programs/web/app.js', { data: data });
      await selftest.expectTrue(fs.existsSync(target));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
