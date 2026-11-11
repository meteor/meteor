var selftest = require('../tool-testing/selftest.js');
var files = require('../fs/files');
var expectEqual = selftest.expectEqual;
// tar-fs does not extract link entries on Windows.
var defineLinkTest = process.platform === "win32" ? selftest.skip.define : selftest.define;

selftest.define("create and extract tarball with long paths", async function () {
  var STAMP = "stamp";

  // Create a directory with a single file in a long subdirectory, to
  // be turned into a tarball.
  var tarballInputDir = files.mkdtemp("tarball-input");
  var longDir = tarballInputDir;
  while (longDir.length < 300) {
    longDir = files.pathJoin(longDir, "subdirectory");
  }
  files.mkdir_p(longDir);
  var inputStampedFile = files.pathJoin(longDir, "file");
  files.writeFile(inputStampedFile, STAMP);

  // Make the tarball
  var tarballOutputDir = files.mkdtemp("tarball");
  var tarballOutputFile = files.pathJoin(tarballOutputDir, "out.tar.gz");
  await files.createTarball(tarballInputDir, tarballOutputFile);

  // Extract the tarball and verify that the single file we created is
  // present with the expected contents.
  var tarballExtractedDir = files.mkdtemp("tarball-extracted");
  await files.extractTarGz(files.readFile(tarballOutputFile), tarballExtractedDir);
  var extractedStampedFile = inputStampedFile.replace(tarballInputDir, tarballExtractedDir);
  await expectEqual(files.readFile(extractedStampedFile, "utf-8"), STAMP);
});

function packToTarGz(buildEntries) {
  var tarStream = require('tar-stream');
  var zlib = require('zlib');
  var pack = tarStream.pack();

  function addEntry(header, body) {
    return new Promise(function (resolve, reject) {
      var cb = function (err) { return err ? reject(err) : resolve(); };
      if (body === undefined) {
        pack.entry(header, cb);
      } else {
        pack.entry(header, body, cb);
      }
    });
  }

  var chunks = [];
  var gzip = zlib.createGzip();
  pack.pipe(gzip);

  var gathered = new Promise(function (resolve, reject) {
    gzip.on('data', function (c) { chunks.push(c); });
    gzip.on('end', function () { resolve(Buffer.concat(chunks)); });
    gzip.on('error', reject);
    pack.on('error', reject);
  });

  return Promise.resolve(buildEntries(addEntry)).then(function () {
    pack.finalize();
    return gathered;
  });
}

defineLinkTest("extractTarGz rejects archives that escape the root", async function () {
  var scratch = files.mkdtemp("tarfs-escape");

  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);
  var sentinel = files.pathJoin(outsideDir, "sentinel.txt");
  files.writeFile(sentinel, "ORIGINAL");

  var payload = Buffer.from("OVERWRITTEN OUTSIDE EXTRACTION ROOT");
  var buffer = await packToTarGz(async function (addEntry) {
    var steps = 15;
    await addEntry({ name: 'package', type: 'directory', mode: 0o755 });
    // `package/root` appears in bounds until the `noop -> .` hops are followed.
    await addEntry({
      name: 'package/root',
      type: 'symlink',
      linkname: 'noop/'.repeat(steps) + '../'.repeat(steps),
    });
    await addEntry({ name: 'package/noop', type: 'symlink', linkname: '.' });
    // The hard link source reaches the sentinel through `package/root`.
    await addEntry({
      name: 'package/hard-sentinel',
      type: 'link',
      linkname: 'package/root' + files.convertToOSPath(sentinel),
    });
    await addEntry({
      name: 'package/hard-sentinel',
      type: 'file',
      size: payload.length,
      mode: 0o644,
    }, payload);
  });

  var destPath = files.pathJoin(scratch, "extracted");
  var threw = false;
  try {
    await files.extractTarGz(buffer, destPath);
  } catch (e) {
    threw = true;
  }

  selftest.expectTrue(threw);
  await expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

defineLinkTest("extractTarGz preserves in-tree symlinks", async function () {
  var scratch = files.mkdtemp("tarfs-legit");

  var buffer = await packToTarGz(async function (addEntry) {
    var body = Buffer.from("REAL");
    await addEntry({ name: 'package', type: 'directory', mode: 0o755 });
    await addEntry({ name: 'package/node_modules', type: 'directory', mode: 0o755 });
    await addEntry({ name: 'package/node_modules/foo', type: 'directory', mode: 0o755 });
    await addEntry({
      name: 'package/node_modules/foo/cli.js',
      type: 'file',
      size: body.length,
      mode: 0o755,
    }, body);
    await addEntry({ name: 'package/node_modules/.bin', type: 'directory', mode: 0o755 });
    await addEntry({
      name: 'package/node_modules/.bin/foo',
      type: 'symlink',
      linkname: '../foo/cli.js',
    });
  });

  var destPath = files.pathJoin(scratch, "extracted");
  await files.extractTarGz(buffer, destPath);

  var linkPath = files.pathJoin(destPath, "node_modules", ".bin", "foo");
  await expectEqual(files.readlink(linkPath), "../foo/cli.js");
  await expectEqual(files.readFile(linkPath, "utf-8"), "REAL");
});

defineLinkTest("extractTarGz rejects a file planted through a symlink", async function () {
  var scratch = files.mkdtemp("tarfs-leaf");
  var destPath = files.pathJoin(scratch, "extracted");

  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);
  var sentinel = files.pathJoin(outsideDir, "sentinel.txt");
  files.writeFile(sentinel, "ORIGINAL");

  var payload = Buffer.from("OVERWRITTEN THROUGH SYMLINK");
  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: 'package', type: 'directory', mode: 0o755 });
    await addEntry({ name: 'package/x', type: 'symlink', linkname: '.' });
    // `x -> .` makes this path reach the sentinel outside the temp root.
    await addEntry({
      name: 'package/pwn',
      type: 'symlink',
      linkname: 'x/../../outside/sentinel.txt',
    });
    await addEntry({
      name: 'package/pwn',
      type: 'file',
      size: payload.length,
      mode: 0o644,
    }, payload);
  });

  var threw = false;
  try {
    await files.extractTarGz(buffer, destPath);
  } catch (e) {
    threw = true;
  }

  selftest.expectTrue(threw);
  await expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

defineLinkTest("extractTarGz rejects entries beneath a planted symlink", async function () {
  var scratch = files.mkdtemp("tarfs-ancestor");
  var destPath = files.pathJoin(scratch, "extracted");

  // `package/A -> x/../..` reaches scratch, where the sentinel lives.
  var sentinel = files.pathJoin(scratch, "sentinel.txt");
  files.writeFile(sentinel, "ORIGINAL");

  var payload = Buffer.from("OVERWRITTEN BENEATH SYMLINK");
  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: 'package', type: 'directory', mode: 0o755 });
    await addEntry({ name: 'package/x', type: 'symlink', linkname: '.' });
    await addEntry({ name: 'package/A', type: 'symlink', linkname: 'x/../..' });
    await addEntry({
      name: 'package/A/sentinel.txt',
      type: 'file',
      size: payload.length,
      mode: 0o644,
    }, payload);
  });

  var threw = false;
  try {
    await files.extractTarGz(buffer, destPath);
  } catch (e) {
    threw = true;
  }

  selftest.expectTrue(threw);
  await expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

defineLinkTest("extractTarGz rejects a symlink to an absolute outside path", async function () {
  var scratch = files.mkdtemp("tarfs-direct");
  var destPath = files.pathJoin(scratch, "extracted");

  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);
  var sentinel = files.pathJoin(outsideDir, "sentinel.txt");
  files.writeFile(sentinel, "ORIGINAL");

  var payload = Buffer.from("OVERWRITTEN VIA ABSOLUTE SYMLINK");
  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: 'package', type: 'directory', mode: 0o755 });
    await addEntry({
      name: 'package/out',
      type: 'symlink',
      linkname: files.convertToOSPath(outsideDir),
    });
    await addEntry({
      name: 'package/out/sentinel.txt',
      type: 'file',
      size: payload.length,
      mode: 0o644,
    }, payload);
  });

  var threw = false;
  try {
    await files.extractTarGz(buffer, destPath);
  } catch (e) {
    threw = true;
  }

  selftest.expectTrue(threw);
  await expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

// `tar -C dir .` archives start with a "./" root entry.
selftest.define("extractTarGz accepts a ./ root entry", async function () {
  var scratch = files.mkdtemp("tarfs-dot-root");

  var body = Buffer.from("DOT ROOT");
  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: './', type: 'directory', mode: 0o755 });
    await addEntry({ name: './package/', type: 'directory', mode: 0o755 });
    await addEntry({
      name: './package/file.txt',
      type: 'file',
      size: body.length,
      mode: 0o644,
    }, body);
  });

  var destPath = files.pathJoin(scratch, "extracted");
  await files.extractTarGz(buffer, destPath);

  await expectEqual(
    files.readFile(files.pathJoin(destPath, "file.txt"), "utf-8"),
    "DOT ROOT");
});

defineLinkTest("extractTarGz rejects a directory entry over a planted symlink", async function () {
  var scratch = files.mkdtemp("tarfs-dir-leaf");
  var destPath = files.pathJoin(scratch, "extracted");

  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);
  files.chmod(outsideDir, 0o700);

  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: 'package/', type: 'directory', mode: 0o755 });
    await addEntry({ name: 'package/x', type: 'symlink', linkname: '.' });
    // `x -> .` makes this path reach outsideDir despite its lexical depth.
    await addEntry({
      name: 'package/pwn',
      type: 'symlink',
      linkname: 'x/../../outside',
    });
    await addEntry({ name: 'package/pwn/', type: 'directory', mode: 0o777 });
  });

  var threw = false;
  try {
    await files.extractTarGz(buffer, destPath);
  } catch (e) {
    threw = true;
  }

  selftest.expectTrue(threw);
  // Read the mode directly: files.stat results are cached.
  var mode = require('fs').statSync(files.convertToOSPath(outsideDir)).mode;
  await expectEqual(mode & 0o777, 0o700);
});

defineLinkTest("extractTarGz rejects a symlink whose target is outside the root", async function () {
  var scratch = files.mkdtemp("tarfs-link-target");
  var destPath = files.pathJoin(scratch, "extracted");

  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);
  var sentinel = files.pathJoin(outsideDir, "sentinel.txt");
  files.writeFile(sentinel, "ORIGINAL");

  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: 'package', type: 'directory', mode: 0o755 });
    await addEntry({
      name: 'package/out',
      type: 'symlink',
      linkname: files.convertToOSPath(sentinel),
    });
  });

  var threw = false;
  try {
    await files.extractTarGz(buffer, destPath);
  } catch (e) {
    threw = true;
  }

  selftest.expectTrue(threw);
  // No later entry writes through the link, so check that it never reaches
  // the extracted tree, where readers of the package would follow it.
  var linkPath = files.convertToOSPath(files.pathJoin(destPath, "out"));
  selftest.expectFalse(require('fs').existsSync(linkPath));
});

defineLinkTest("extractTarGz rejects a directory entry beneath a planted symlink", async function () {
  var scratch = files.mkdtemp("tarfs-dir-ancestor");
  var destPath = files.pathJoin(scratch, "extracted");

  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);

  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: 'package/', type: 'directory', mode: 0o755 });
    await addEntry({ name: 'package/x', type: 'symlink', linkname: '.' });
    // `package/A -> x/../..` reaches scratch once `x -> .` is followed.
    await addEntry({ name: 'package/A', type: 'symlink', linkname: 'x/../..' });
    // tar-fs creates directory entries without checking their ancestors.
    await addEntry({ name: 'package/A/outside/pwn/', type: 'directory', mode: 0o755 });
  });

  var threw = false;
  try {
    await files.extractTarGz(buffer, destPath);
  } catch (e) {
    threw = true;
  }

  selftest.expectTrue(threw);
  await expectEqual(require('fs').readdirSync(files.convertToOSPath(outsideDir)), []);
});

defineLinkTest("extractTarGz rejects a hard link whose source leaves the root through a planted symlink", async function () {
  var scratch = files.mkdtemp("tarfs-hard-ancestor");
  var destPath = files.pathJoin(scratch, "extracted");

  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);
  var sentinel = files.pathJoin(outsideDir, "sentinel.txt");
  files.writeFile(sentinel, "ORIGINAL");

  var decoy = Buffer.from("DECOY");
  var payload = Buffer.from("OVERWRITTEN THROUGH HARD LINK");
  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: 'package/', type: 'directory', mode: 0o755 });
    await addEntry({ name: 'package/outside/', type: 'directory', mode: 0o755 });
    await addEntry({
      name: 'package/outside/sentinel.txt',
      type: 'file',
      size: decoy.length,
      mode: 0o644,
    }, decoy);
    await addEntry({ name: 'package/x', type: 'symlink', linkname: '.' });
    // Resolving `..` lexically gives `package`, but the kernel follows
    // `x -> .` and reaches scratch.
    await addEntry({ name: 'package/A', type: 'symlink', linkname: 'x/x/../..' });
    await addEntry({
      name: 'package/hard-sentinel',
      type: 'link',
      linkname: 'package/A/outside/sentinel.txt',
    });
    await addEntry({
      name: 'package/hard-sentinel',
      type: 'file',
      size: payload.length,
      mode: 0o644,
    }, payload);
  });

  var threw = false;
  try {
    await files.extractTarGz(buffer, destPath);
  } catch (e) {
    threw = true;
  }

  selftest.expectTrue(threw);
  await expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

defineLinkTest("extractTarGz rejects standalone symlinks outside the relocated package", async function () {
  const assert = require("assert").strict;
  const scratch = files.mkdtemp("tarfs-relocated-link");
  const destination = files.pathJoin(scratch, "extracted");

  for (const target of ["..", "x/x/../.."]) {
    const archive = await packToTarGz(async function (addEntry) {
      await addEntry({ name: "package/", type: "directory", mode: 0o755 });
      await addEntry({ name: "package/link", type: "symlink", linkname: target });
      // Resolve links again after extraction, including forward references.
      await addEntry({ name: "package/x", type: "symlink", linkname: "." });
    });
    await assert.rejects(files.extractTarGz(archive, destination));
    assert.equal(files.exists(destination), false);
  }
});
