var selftest = require('../tool-testing/selftest.js');
var files = require('../fs/files');
var expectEqual = selftest.expectEqual;

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
  expectEqual(files.readFile(extractedStampedFile, "utf-8"), STAMP);
});

// Helper: gzip a tar-stream pack into a single Buffer.
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

// MET-004: a crafted archive can chain a symlink to a hard link so that
// tar-fs (before 2.1.2) dereferences it and overwrites a file outside the
// extraction root. extractTarGz must refuse such archives and leave files
// outside the root untouched.
selftest.define("extractTarGz rejects archives that escape the root", async function () {
  var scratch = files.mkdtemp("tarfs-escape");

  // Sentinel file that lives OUTSIDE the extraction root.
  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);
  var sentinel = files.pathJoin(outsideDir, "sentinel.txt");
  files.writeFile(sentinel, "ORIGINAL");

  var payload = Buffer.from("OVERWRITTEN OUTSIDE EXTRACTION ROOT");
  var buffer = await packToTarGz(async function (addEntry) {
    var steps = 15;
    await addEntry({ name: 'package', type: 'directory', mode: 0o755 });
    // `package/root` lexically stays inside the root, but its real target
    // escapes once the `noop -> .` symlinks are followed.
    await addEntry({
      name: 'package/root',
      type: 'symlink',
      linkname: 'noop/'.repeat(steps) + '../'.repeat(steps),
    });
    await addEntry({ name: 'package/noop', type: 'symlink', linkname: '.' });
    // The hard link dereferences `package/root` to reach the sentinel.
    await addEntry({
      name: 'package/hard-sentinel',
      type: 'link',
      linkname: 'package/root' + files.convertToOSPath(sentinel),
    });
    // Writing to the hard link would overwrite the sentinel on tar-fs 2.1.1.
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

  // Extraction must fail, and the file outside the root must be untouched.
  selftest.expectTrue(threw);
  expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

// The escape guard must not disturb legitimate archives, including the
// relative symlinks that appear inside isopack node_modules/.bin directories.
selftest.define("extractTarGz preserves in-tree symlinks", async function () {
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
    // A relative symlink that resolves within the extraction root.
    await addEntry({
      name: 'package/node_modules/.bin/foo',
      type: 'symlink',
      linkname: '../foo/cli.js',
    });
  });

  var destPath = files.pathJoin(scratch, "extracted");
  await files.extractTarGz(buffer, destPath);

  var linkPath = files.pathJoin(destPath, "node_modules", ".bin", "foo");
  // The symlink is preserved as a symlink pointing at the in-tree target...
  expectEqual(files.readlink(linkPath), "../foo/cli.js");
  // ...and following it reads the real file's contents.
  expectEqual(files.readFile(linkPath, "utf-8"), "REAL");
});

// MET-004 (leaf variant): a symlink whose lexical target stays in-root but
// whose real target escapes (its real depth differs from its lexical depth,
// via the `x -> .` hop), followed by a FILE entry with the same name. tar-fs
// 2.1.1 writes the file straight through the symlink, overwriting the outside
// target. extractTarGz creates a temp dir `<parent>/.tmpXXXX` and the archive's
// single top-level dir sits one level below it, so `x/../..` climbs to
// `<parent>` (dirname of destPath); the sentinel lives at
// `<parent>/outside/sentinel.txt`.
selftest.define("extractTarGz rejects a file planted through a symlink", async function () {
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
    // Lexically resolves inside the temp root; really resolves to the sentinel.
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
  expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

// MET-004 (ancestor variant): a file entry written beneath a planted symlink
// directory. tar-fs's own path validation already blocks this on 2.1.1; the
// guard rejects it too, as defense in depth.
selftest.define("extractTarGz rejects entries beneath a planted symlink", async function () {
  var scratch = files.mkdtemp("tarfs-ancestor");
  var destPath = files.pathJoin(scratch, "extracted");

  // `package/A -> x/../..` resolves to <parent> (dirname of destPath) at run
  // time, so the escaping file entry would land at <parent>/sentinel.txt.
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
  expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

// MET-004 (direct variant): a symlink that points straight at an absolute path
// outside the root, followed by a file written through it. The lexical
// symlink-target check blocks the symlink.
selftest.define("extractTarGz rejects a symlink to an absolute outside path", async function () {
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
  expectEqual(files.readFile(sentinel, "utf-8"), "ORIGINAL");
});

// Archives made with `tar -C dir .` start with a "./" entry for the root
// itself. The guard must keep accepting it.
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

  expectEqual(
    files.readFile(files.pathJoin(destPath, "file.txt"), "utf-8"),
    "DOT ROOT");
});

// MET-004 (directory variant): a directory entry whose name, with its trailing
// slash, is a symlink planted earlier. tar-fs 2.1.1 would chmod (and utimes)
// the symlink's real target outside the root.
selftest.define("extractTarGz rejects a directory entry over a planted symlink", async function () {
  var scratch = files.mkdtemp("tarfs-dir-leaf");
  var destPath = files.pathJoin(scratch, "extracted");

  var outsideDir = files.pathJoin(scratch, "outside");
  files.mkdir_p(outsideDir);
  files.chmod(outsideDir, 0o700);

  var buffer = await packToTarGz(async function (addEntry) {
    await addEntry({ name: 'package/', type: 'directory', mode: 0o755 });
    await addEntry({ name: 'package/x', type: 'symlink', linkname: '.' });
    // Lexically resolves inside the temp root; really resolves to outsideDir.
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
  expectEqual(mode & 0o777, 0o700);
});
