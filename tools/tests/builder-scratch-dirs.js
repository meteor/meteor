const selftest = require('../tool-testing/selftest.js');
const files = require('../fs/files');
const Builder = require('../isobuild/builder.js').default;
const meteorNpm = require('../isobuild/meteor-npm.js');

// Regression tests for the npm-rebuild scratch-dir race (#14679):
// rebuildIfNonPortable must not leave its .temp-* directory behind for the
// bundler walk, the walk must survive entries vanishing under it, and
// Meteor's scratch directories at the root of a copied node_modules must
// never be bundled, while package-owned lookalikes are preserved.

// lstat without following the symlink and without the tool's fs caches.
function linkExists(path) {
  try {
    require('fs').lstatSync(files.convertToOSPath(path));
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

function writeFile(path, contents) {
  files.mkdir_p(files.pathDirname(path));
  files.writeFile(path, contents);
}

async function copyNodeModules(nm, { symlink = false } = {}) {
  const outputPath = files.pathJoin(
    files.mkdtemp('builder-scratch-out'), 'bundle');
  const builder = new Builder({ outputPath });
  await builder.init();
  await builder.copyNodeModulesDirectory({
    from: nm,
    to: 'node_modules',
    symlink,
  });
  await builder.complete();
  return files.pathJoin(outputPath, 'node_modules');
}

async function buildAndCheck(symlink) {
  const nm = files.pathJoin(
    files.mkdtemp('builder-scratch-source'), 'node_modules');

  // Meteor-owned scratch dirs, directly under the copied node_modules and
  // under one of its @scope directories.
  writeFile(files.pathJoin(nm, '.temp-abc123', 'node_modules', 'junk.txt'),
    'junk\n');
  writeFile(files.pathJoin(nm, '.temp-abc123.old-42', 'node_modules',
    'junk.txt'), 'junk\n');
  writeFile(files.pathJoin(nm, '@scope', '.pkg-garbage-xyz789', 'junk.txt'),
    'junk\n');

  // Package-owned lookalikes below the root.
  writeFile(files.pathJoin(nm, 'example', 'package.json'),
    '{"name":"example","version":"1.0.0"}\n');
  writeFile(files.pathJoin(nm, 'example', '.temp-cache', 'keep.txt'),
    'keep\n');
  writeFile(files.pathJoin(nm, 'example', 'node_modules', '.temp-nested1',
    'keep.txt'), 'keep\n');
  writeFile(files.pathJoin(nm, '@scope', 'pkg', 'package.json'),
    '{"name":"@scope/pkg","version":"1.0.0"}\n');
  writeFile(files.pathJoin(nm, '@scope', 'pkg', '.pkg-garbage-abc123',
    'keep.txt'), 'keep\n');

  const outNm = await copyNodeModules(nm, { symlink });
  const exists = (...parts) => files.exists(files.pathJoin(outNm, ...parts));

  await selftest.expectEqual(
    exists('example', '.temp-cache', 'keep.txt'), true);
  await selftest.expectEqual(
    exists('example', 'node_modules', '.temp-nested1', 'keep.txt'), true);
  await selftest.expectEqual(
    exists('@scope', 'pkg', '.pkg-garbage-abc123', 'keep.txt'), true);
  await selftest.expectEqual(exists('.temp-abc123'), false);
  await selftest.expectEqual(exists('.temp-abc123.old-42'), false);
  await selftest.expectEqual(exists('@scope', '.pkg-garbage-xyz789'), false);
}

selftest.define(
  'builder - scratch dirs excluded from node_modules copies',
  async () => {
    await buildAndCheck(false);
  });

selftest.define(
  'builder - scratch dirs excluded from symlinked node_modules copies',
  async () => {
    // The symlink variant also exercises the _ensureAllNonPackageDirectories
    // pre-pass, which must skip scratch dirs too.
    await buildAndCheck(true);
  });

selftest.define(
  'builder - node_modules copy skips a symlink deleted mid-walk',
  async () => {
    const nm = files.pathJoin(
      files.mkdtemp('builder-vanish-source'), 'node_modules');
    writeFile(files.pathJoin(nm, 'pkg', 'package.json'),
      '{"name":"pkg","version":"1.0.0"}\n');
    writeFile(files.pathJoin(nm, 'pkg', 'bin.js'), '\n');
    files.mkdir_p(files.pathJoin(nm, '.bin'));
    files.symlink('../pkg/bin.js', files.pathJoin(nm, '.bin', 'gone'));
    files.symlink('../pkg/bin.js', files.pathJoin(nm, '.bin', 'kept'));

    // Delete `gone` after the walk has lstat'ed it but before it is read,
    // the window a concurrent deletion hits.
    const originalReadlink = files.readlink;
    let vanished = 0;
    files.readlink = (path, ...args) => {
      if (files.pathBasename(path) === 'gone') {
        files.unlink(path);
        vanished++;
      }
      return originalReadlink(path, ...args);
    };
    let outNm;
    try {
      outNm = await copyNodeModules(nm);
    } finally {
      files.readlink = originalReadlink;
    }

    await selftest.expectEqual(vanished, 1);
    await selftest.expectEqual(
      linkExists(files.pathJoin(outNm, '.bin', 'gone')), false);
    await selftest.expectEqual(
      linkExists(files.pathJoin(outNm, '.bin', 'kept')), true);
    await selftest.expectEqual(
      files.exists(files.pathJoin(outNm, 'pkg', 'bin.js')), true);
  });

selftest.define(
  'npm - rebuildIfNonPortable removes its scratch dir before returning',
  async () => {
    const nm = files.pathJoin(
      files.mkdtemp('rebuild-scratch'), 'node_modules');
    // A package without build scripts is non-portable if it ships a .node
    // file; npm rebuild then has nothing to do, so this runs offline.
    writeFile(files.pathJoin(nm, 'native', 'package.json'),
      '{"name":"native","version":"1.0.0"}\n');
    writeFile(files.pathJoin(nm, 'native', 'build', 'fake.node'), '');

    await selftest.expectEqual(
      await meteorNpm.rebuildIfNonPortable(nm), true);

    // The bundler walks nm right after this returns; nothing may remain
    // for it to step into.
    await selftest.expectEqual(
      files.readdir(nm).filter(item => item.startsWith('.temp-')), []);
    await selftest.expectEqual(
      files.exists(files.pathJoin(nm, 'native',
        '.meteor-last-rebuild-version.json')), true);
  });
