Package.describe({
  name: 'static-render',
  summary: 'Pre-render Blaze routes as static HTML for SEO',
  version: '1.0.0',
  documentation: 'README.md',
});

Package.onUse(function (api) {
  // Server-only: the package ships no client code. `htmljs` and `tracker` are
  // not referenced here — blaze already implies htmljs and pulls tracker in
  // itself.
  //
  // Note that `Template` is not imported from a declared dependency: the
  // registry is exported by templating-runtime, and this package reads it off
  // the app's global, which exists by the time discovery runs in a startup
  // hook. render() therefore checks `typeof Template` before using it.
  api.use([
    'ecmascript',
    'webapp',
    'blaze',
  ], 'server');

  // Weak so that adding this package never forces flow-router-extra into an
  // app that does not use it. Route discovery is the only source of routes
  // today, so without flow-router-extra StaticRender renders nothing —
  // Blaze.toHTML() remains available for manual, router-free rendering.
  api.use('ostrio:flow-router-extra@3.10.2', { weak: true });

  api.export('StaticRender', 'server');
  api.addFiles('static-render-server.js', 'server');
});

Package.onTest(function (api) {
  api.use([
    'ecmascript',
    'tinytest',
    'static-render',
  ], 'server');

  api.addFiles('static-render-tests.js', 'server');
});
