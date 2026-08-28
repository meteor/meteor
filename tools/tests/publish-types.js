var selftest = require('../tool-testing/selftest.js');
var files = require('../fs/files');
var {
  addTypeDeclarationSources
} = require('../packaging/package-source-bundle.js');
var {
  usePrebuiltTypeScriptDeclarations
} = require('../packaging/typescript-declarations.js');

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

  // Publishing again with a warm isopack cache must behave identically:
  // publish force-rebuilds the package after the tsc rewrite (the cached
  // isopack could have been built from the pre-rewrite ts-src source, and
  // nothing in its buildinfo reflects the rewrite), so the second run also
  // regenerates and stamps directory-mode metadata.
  const rerun = s.run('publish');
  rerun.waitSecs(180);
  await rerun.match('[types] Generated declarations for ts-types-package with tsc');
  await rerun.matchErr(/Would publish the package at this point/);
  await rerun.expectExit(0);

  const isopackJsonAgain = s.read(
    '../../.meteor/local/isopacks/ts-types-package/isopack.json');
  selftest.expectTrue(isopackJsonAgain !== null);
  const mainJsonAgain = JSON.parse(isopackJsonAgain)['isopack-2'];
  selftest.expectTrue(!!mainJsonAgain);
  await selftest.expectEqual(mainJsonAgain.typesDir, '.types-build');
  await selftest.expectEqual(mainJsonAgain.typesEntry, '.types-build/index.d.ts');
});

selftest.define('prebuilt declaration source bundle roundtrip', async function () {
  const packageDir = files.mkdtemp('prebuilt-types-package');
  const typesDir = files.pathJoin(packageDir, '.types-build');
  files.mkdir_p(files.pathJoin(typesDir, 'client'));

  files.writeFile(
    files.pathJoin(packageDir, 'package.js'),
    "Package.onUse(api => api.types('index.ts'));\n"
  );
  files.writeFile(
    files.pathJoin(typesDir, 'index.d.ts'),
    'export declare const value: 42;\n'
  );
  files.writeFile(
    files.pathJoin(typesDir, 'index.d.ts.map'),
    '{"version":3}\n'
  );
  files.writeFile(
    files.pathJoin(typesDir, 'client', 'hooks.d.ts'),
    'export declare function useValue(): 42;\n'
  );
  files.writeFile(
    files.pathJoin(typesDir, '.tsbuildinfo'),
    'compiler state must not be published\n'
  );

  const collected = addTypeDeclarationSources({
    packageDir,
    typesDir: '.types-build',
    sourceFiles: ['package.js']
  });
  selftest.expectTrue(collected.ok);
  selftest.expectTrue(
    collected.sourceFiles.includes('.types-build/index.d.ts')
  );
  selftest.expectTrue(
    collected.sourceFiles.includes('.types-build/client/hooks.d.ts')
  );
  selftest.expectTrue(
    ! collected.sourceFiles.includes('.types-build/.tsbuildinfo')
  );

  const stagedDir = files.mkdtemp('prebuilt-types-source');
  collected.sourceFiles.forEach(function (relativePath) {
    files.copyFile(
      files.pathJoin(packageDir, relativePath),
      files.pathJoin(stagedDir, relativePath)
    );
  });

  const tarballDir = files.mkdtemp('prebuilt-types-tarball');
  const tarball = files.pathJoin(tarballDir, 'source.tgz');
  await files.createTarball(stagedDir, tarball);

  const extractedDir = files.mkdtemp('prebuilt-types-extracted');
  await files.extractTarGz(files.readFile(tarball), extractedDir);

  // The extracted source intentionally has no tsconfig.json, .ts entry, or
  // compiler state. publish-for-arch must be able to prepare its metadata
  // solely from the authoritative declarations in the source bundle.
  const extractedPackageSource = {
    typesDir: null,
    typesEntry: './index.ts',
    typesModules: { hooks: './client/hooks.tsx' }
  };
  const rewrite = usePrebuiltTypeScriptDeclarations(
    extractedPackageSource, extractedDir);
  selftest.expectTrue(rewrite.ok);
  selftest.expectEqual(extractedPackageSource, {
    typesDir: '.types-build',
    typesEntry: '.types-build/index.d.ts',
    typesModules: { hooks: '.types-build/client/hooks.d.ts' }
  });
  selftest.expectEqual(
    files.readFile(
      files.pathJoin(extractedDir, '.types-build', 'index.d.ts'),
      'utf8'
    ),
    files.readFile(files.pathJoin(typesDir, 'index.d.ts'), 'utf8')
  );

  files.rm_recursive(
    files.pathJoin(extractedDir, '.types-build', 'client', 'hooks.d.ts')
  );
  const incompletePackageSource = {
    typesDir: null,
    typesEntry: 'index.ts',
    typesModules: { hooks: 'client/hooks.tsx' }
  };
  const incomplete = usePrebuiltTypeScriptDeclarations(
    incompletePackageSource, extractedDir);
  selftest.expectTrue(! incomplete.ok);
  selftest.expectEqual(incomplete.missing, [{
    label: 'modules.hooks',
    sourcePath: 'client/hooks.tsx',
    declarationPath: '.types-build/client/hooks.d.ts'
  }]);
  selftest.expectTrue(incompletePackageSource.typesDir === null);

  files.copyFile(
    files.pathJoin(typesDir, 'client', 'hooks.d.ts'),
    files.pathJoin(extractedDir, '.types-build', 'client', 'hooks.d.ts')
  );
  files.rm_recursive(
    files.pathJoin(extractedDir, '.types-build', 'index.d.ts')
  );
  const missingEntrySource = {
    typesDir: null,
    typesEntry: 'index.ts',
    typesModules: { hooks: 'client/hooks.tsx' }
  };
  const missingEntry = usePrebuiltTypeScriptDeclarations(
    missingEntrySource, extractedDir);
  selftest.expectTrue(! missingEntry.ok);
  selftest.expectEqual(missingEntry.missing, [{
    label: 'entry',
    sourcePath: 'index.ts',
    declarationPath: '.types-build/index.d.ts'
  }]);
  selftest.expectTrue(missingEntrySource.typesDir === null);
});
