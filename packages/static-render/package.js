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

  // weak dependency — flow-router-extra is optional,
  // StaticRender can also be used with manual route registration
  api.use('ostrio:flow-router-extra@3.10.2', { weak: true });

  api.export('StaticRender', 'server');
  api.addFiles('static-render-server.js', 'server');
});
