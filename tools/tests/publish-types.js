var selftest = require('../tool-testing/selftest.js');

var Sandbox = selftest.Sandbox;

// A TypeScript-authored package (api.types('index.ts')) publishes with
// generated declarations: `meteor publish` runs tsc to emit
// .types-build/**/*.d.ts inside the package directory, rewrites the
// PackageSource to the directory form of api.types(), and the build stamps
// the rewritten metadata into the isopack — the published package is a
// plain directory-mode types package and consumers never see the .ts entry.
//
// METEOR_TEST_NO_PUBLISH short-circuits AFTER the build, so the whole
// tsc + asset-inclusion path is exercised with zero network.
selftest.define('publish TypeScript-authored package types', async function () {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp('myapp', 'publish-types');
  s.cd('myapp/packages/ts-types-package');
  s.set('METEOR_TEST_NO_PUBLISH', 't');

  const run = s.run('publish');
  run.waitSecs(180);
  await run.match('[types] Generated declarations for ts-types-package with tsc');
  await run.matchErr(/Would publish the package at this point/);
  await run.expectExit(0);

  // tsc wrote real declaration files into the package directory.
  const generated = s.read('.types-build/index.d.ts');
  selftest.expectTrue(generated !== null);
  selftest.expectTrue(generated.indexOf('declare const x') !== -1);
  selftest.expectTrue(generated.indexOf('declare function double') !== -1);

  // The built isopack carries plain directory-mode metadata: typesDir is
  // set and typesEntry points at the generated declaration file.
  const isopackJson = s.read(
    '../../.meteor/local/isopacks/ts-types-package/isopack.json');
  selftest.expectTrue(isopackJson !== null);
  const mainJson = JSON.parse(isopackJson)['isopack-2'];
  selftest.expectTrue(!!mainJson);
  await selftest.expectEqual(mainJson.typesDir, '.types-build');
  await selftest.expectEqual(mainJson.typesEntry, '.types-build/index.d.ts');
});
