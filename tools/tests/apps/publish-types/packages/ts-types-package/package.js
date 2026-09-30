Package.describe({
  name: 'ts-types-package',
  version: '0.0.1',
  summary: 'TypeScript-authored package fixture for the publish-types self-test.',
  documentation: null
});

Package.onUse(function (api) {
  api.use('typescript');
  api.mainModule('index.ts', 'server');
  // A .ts entry marks the package as TypeScript-authored: `meteor publish`
  // generates .types-build/index.d.ts with tsc and rewrites the package to
  // the directory form of api.types() before building.
  api.types('index.ts');
});
