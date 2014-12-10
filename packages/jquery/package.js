Package.describe({
  summary: "Manipulate the DOM using CSS selectors",
  version: '1.0.2-ipc.0'
});

Package.onUse(function (api) {
  api.addFiles(['jquery.js', 'post.js'], 'client');

  api.export('$', 'client');
  api.export('jQuery', 'client');
});
