import Resolver from '../isobuild/resolver';
import assert from 'node:assert';
var selftest = require('../tool-testing/selftest.js');

let serverResolver = new Resolver({
  sourceRoot: '',
  targetArch: 'os.windows.x86_64',
});

selftest.define("resolver - exports - '.' subpath ", function () {
  [
    './react.js',
    { '.': './react.js' },
    { '.': { default: './react.js' }},
    { default: './react.js' },
  ].forEach((exports) => {
    assert.deepStrictEqual(
      serverResolver.resolvePackageExports('.', exports),
      [{ key: '.', value: './react.js' }],
      `Testing exports: ${JSON.stringify(exports)}`
    );
  });

  assert.deepStrictEqual(
    serverResolver.resolvePackageExports('.', { 'browser' :'./test.js' }),
    [],
    `Testing exports: ${JSON.stringify(exports)}`
  );
  assert.deepStrictEqual(
    serverResolver.resolvePackageExports('.', { './fun.js' :'./test.js' }),
    [],
    `Testing exports: ${JSON.stringify(exports)}`
  );
});

selftest.define("resolver - exports - exact subpaths", function () {
  [
    { './test.js': './src/test.js' },
    { './test.js': { default: './src/test.js' }},
  ].forEach((exports) => {
    assert.deepStrictEqual(
      serverResolver.resolvePackageExports('./test.js', exports),
      [{ key: './test.js', value: './src/test.js' }],
      `Testing exports: ${JSON.stringify(exports)}`
    );
  });
});

selftest.define("resolver - exports - wildcard subpaths", function () {
  assert.deepStrictEqual(
    serverResolver.resolvePackageExports('./features/animations.js', { './features/*.js': './src/features/*.js' }),
    [{ key: './features/*.js', value: './src/features/*.js', resolved: './src/features/animations.js' }],
  );
});
