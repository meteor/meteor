Package.describe({
  summary: "Manipulate the DOM using CSS selectors",
  // This matches the upstream version. If you want to publish a new version of
  // the package without pulling a new upstream version, you should call it
  // '1.11.2_1'.
  version: '1.11.2'
});

Package.onUse(function (api) {
  api.addFiles(['jquery.js', 'post.js'], 'client');

  api.export('$', 'client');
  api.export('jQuery', 'client');
});
