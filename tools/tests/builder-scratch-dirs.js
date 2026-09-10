const selftest = require('../tool-testing/selftest.js');
const files = require('../fs/files');
const Builder = require('../isobuild/builder.js').default;

// Regression test for the npm-rebuild scratch-dir race: transient
// directories that meteorNpm.rebuildIfNonPortable / rm_recursive_deferred /
// renameDirAlmostAtomically leave directly inside a node_modules directory
// must never be copied into bundles, while package-owned directories with
// similar names deeper in the tree must be preserved.
async function buildAndCheck(symlink) {
  const sourceRoot = files.mkdtemp('builder-scratch-source');
  const nm = files.pathJoin(sourceRoot, 'node_modules');

  // Meteor-owned scratch dirs, directly under node_modules and under a
  // node_modules/@scope directory.
  files.mkdir_p(files.pathJoin(nm, '.temp-abc123.old-42', 'node_modules'));
  files.writeFile(
    files.pathJoin(nm, '.temp-abc123.old-42', 'node_modules', 'junk.txt'),
    'junk\n');
  files.mkdir_p(files.pathJoin(nm, '@scope', '.pkg-garbage-xyz789'));
  files.writeFile(
    files.pathJoin(nm, '@scope', '.pkg-garbage-xyz789', 'junk.txt'),
    'junk\n');

  // Package-owned lookalike deeper in the tree.
  files.mkdir_p(files.pathJoin(nm, 'example', '.temp-cache'));
  files.writeFile(
    files.pathJoin(nm, 'example', 'package.json'),
    '{"name":"example","version":"1.0.0"}\n');
  files.writeFile(
    files.pathJoin(nm, 'example', '.temp-cache', 'keep.txt'),
    'keep\n');

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

  const outNm = files.pathJoin(outputPath, 'node_modules');
  await selftest.expectEqual(
    files.exists(files.pathJoin(outNm, 'example', '.temp-cache', 'keep.txt')),
    true);
  await selftest.expectEqual(
    files.exists(files.pathJoin(outNm, '.temp-abc123.old-42')),
    false);
  await selftest.expectEqual(
    files.exists(files.pathJoin(outNm, '@scope', '.pkg-garbage-xyz789')),
    false);
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
