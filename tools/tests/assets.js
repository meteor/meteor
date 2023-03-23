var selftest = require('../tool-testing/selftest.js');

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

async function startRun(sandbox) {
  var run = sandbox.run();
  await run.match("myapp");
  await run.match("proxy");
  await run.tellMongo(MONGO_LISTENING);
  await run.match("MongoDB");
  return run;
}

// Test that an app can properly read assets with unicode based filenames
selftest.define("assets - unicode asset names are allowed", async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp('myapp', 'unicode-asset-app');
  s.cd('myapp');
  const run = await startRun(s);
  await run.match('1 - getText: Hello world!');
  await run.match('2 - getText: Hello world!');
  await run.match('3 - getText: Hello world!');
  await run.match(/1 - absoluteFilePath:(.*)ma_a_verde.txt/);
  await run.match(/2 - absoluteFilePath:(.*)ma_a_verde.txt/);
  await run.match(/3 - absoluteFilePath:(.*)ma_a_verde.txt/);
  await run.stop();
});

// Verify path strings can be Unicode normalized through the
// tools/static-assets/server/mini-files.ts#unicodeNormalizePath helper
selftest.define(
  "assets - helper exists to unicode normalize path strings",
  async () => {
    const files = require('../static-assets/server/mini-files.ts');

    await selftest.expectEqual(null, files.unicodeNormalizePath(null));

    const unicodeNormalizedPath = '/path/maça verde.txt'.normalize('NFC');
    const testPaths = [
      '/path/maça verde.txt',
      '/path/mac\u0327a verde.txt',
      '/path/ma\xE7a verde.txt',
    ];
    for (const path of testPaths) {
        await selftest.expectEqual(unicodeNormalizedPath, files.unicodeNormalizePath(path));
    }
  }
);
