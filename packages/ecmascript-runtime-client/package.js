Package.describe({
  name: 'ecmascript-runtime-client',
  version: '0.12.2-rc300.3',
  summary: 'Polyfills for new ECMAScript 2015 APIs like Map and Set',
  git:
    'https://github.com/meteor/meteor/tree/devel/packages/ecmascript-runtime-client',
  documentation: 'README.md',
});

Npm.depends({
  'core-js': '3.15.2',
});

Package.onUse(function(api) {
  // If the es5-shim package is installed, make sure it loads before
  // ecmascript-runtime-server, since the runtime uses some ES5 APIs like
  // Object.defineProperties that are buggy in older browsers.
  api.use('es5-shim', { weak: true });

  api.use('modules');
  api.use('promise');
  api.use('modern-browsers');

  api.mainModule('versions.js', 'server');
  api.mainModule('modern.js', 'client');

  api.mainModule('legacy.js', 'legacy');
  api.export('Symbol', 'legacy');
  api.export('Map', 'legacy');
  api.export('Set', 'legacy');
});
