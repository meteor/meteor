var selftest = require('../tool-testing/selftest.js');
import { getUrl } from '../utils/http-helpers.js';

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

async function startRun(sandbox) {
  var run = sandbox.run();
  await run.match("myapp");
  run.matchBeforeExit("Started proxy");
  await run.tellMongo(MONGO_LISTENING);
  run.matchBeforeExit("Started MongoDB");
  run.waitSecs(15);
  return run;
}

async function checkModernAndLegacyUrls(path, test) {
  if (! path.startsWith("/")) {
    path = "/" + path;
  }
  await test(await getUrl("http://localhost:3000" + path));
  // Asset URLs are no longer prefixed with /__browser.legacy because the
  // developer has full control over the path where an asset is served, so
  // there's not much value in serving a legacy version of every asset.
  // test(getUrl("http://localhost:3000/__browser.legacy" + path));
}

// Test error when a source file no longer has an active plugin.
selftest.define("compiler plugins - inactive source", async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  // This app depends on the published package 'glasser:uses-sourcish', and
  // contains a local package 'local-plugin'.
  //
  // glasser:uses-sourcish depends on local-plugin and contains a file
  // 'foo.sourcish'. When glasser:uses-sourcish@0.0.1 was published, a local
  // copy of 'local-plugin' had a plugin which called registerCompiler for the
  // extension '*.sourcish', and so 'foo.sourcish' is in the published isopack
  // as a source file. However, the copy of 'local-plugin' currently in the test
  // app contains no plugins. So we hit this weird error.
  await s.createApp('myapp', 'uses-published-package-with-inactive-source');
  s.cd('myapp');

  const run = s.run();
  await run.match('myapp');
  run.matchBeforeExit('Started proxy');
  await run.match('Errors prevented startup');
  await run.match('no plugin found for foo.sourcish in glasser:use-sourcish');
  await run.match('none is now');
  await run.stop();
});

// Test that compiler plugins can add static assets. Also tests `filenames`
// option to registerCompiler.
selftest.define("compiler plugins - compiler addAsset", async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp('myapp', 'compiler-plugin-add-asset');
  s.cd('myapp');

  const run = await startRun(s);
  // Test server-side asset.
  await run.match("extension is null");  // test getExtension -> null
  await run.match("Asset says Print out foo");

  // Test client-side asset.
  await checkModernAndLegacyUrls("/foo.printme", body => {
    selftest.expectEqual(body, "Print out foo\n");
  });

  await run.stop();
});


// Test that a package can have a single file that is both source code and an
// asset
selftest.define("compiler plugins - addAssets", async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp('myapp', 'compiler-plugin-asset-and-source');
  s.cd('myapp');

  const run = await startRun(s);

  // Test server-side asset.
  await run.match("Printing out my own source code!");

  // Test client-side asset.
  await checkModernAndLegacyUrls(
    "/packages/asset-and-source/asset-and-source.js",
    body => {
      selftest.expectTrue(
        body.indexOf("Printing out my own source code!") !== -1
      );
    }
  );

  // Test that deprecated API still works (added in 1.2.1 in response to people
  // having trouble upgrading to 1.2)
  s.write("packages/asset-and-source/package.js", `Package.describe({
      name: 'asset-and-source',
      version: '0.0.1'
    });

    Package.onUse(function(api) {
      api.addFiles('asset-and-source.js');
      api.addFiles('asset-and-source.js',
        ['client', 'server'], { isAsset: true });
    });
  `);

  // Test server-side asset.
  await run.match("Printing out my own source code!");

  // Test client-side asset.
  await checkModernAndLegacyUrls(
    "/packages/asset-and-source/asset-and-source.js",
    body => {
      selftest.expectTrue(
        body.indexOf('Printing out my own source code!') !== -1
      );
    }
  );

  // Test error messages for malformed package files
  s.write("packages/asset-and-source/package.js", `Package.describe({
      name: 'asset-and-source',
      version: '0.0.1'
    });

    Package.onUse(function(api) {
      api.addFiles('asset-and-source.js');
      api.addAssets('asset-and-source.js', ['client', 'server']);
      api.addFiles('asset-and-source.js');
    });
  `);

  await run.match(/Duplicate source file/);

  s.write("packages/asset-and-source/package.js", `Package.describe({
      name: 'asset-and-source',
      version: '0.0.1'
    });

    Package.onUse(function(api) {
      api.addFiles('asset-and-source.js');
      api.addAssets('asset-and-source.js', ['client', 'server']);
      api.addAssets('asset-and-source.js', ['client', 'server']);
    });
  `);

  await run.match(/Duplicate asset file/);

  s.write("packages/asset-and-source/package.js", `Package.describe({
      name: 'asset-and-source',
      version: '0.0.1'
    });

    Package.onUse(function(api) {
      api.addAssets('asset-and-source.js');
    });
  `);

  await run.match(/requires a second argument/);

  await run.stop();
});
