Package.describe({
  name: 'static-render',
  summary: 'Pre-render Blaze routes as static HTML for SEO',
  version: '1.0.0',
  documentation: 'README.md',
});

Package.onUse(function (api) {
  api.use([
    'ecmascript',
    'webapp',
    'blaze',
    'htmljs',
    'tracker',
  ]);

  // Weak so that adding this package never forces flow-router-extra into an
  // app that does not use it. Route discovery is the only source of routes
  // today, so without flow-router-extra StaticRender renders nothing —
  // Blaze.toHTML() remains available for manual, router-free rendering.
  api.use('ostrio:flow-router-extra@3.10.2', { weak: true });

  api.export('StaticRender', 'server');
  api.addFiles('static-render-server.js', 'server');
});
