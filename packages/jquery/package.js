Package.describe({
  summary: "Manipulate the DOM using CSS selectors",

  // This is actually jQuery 1.11.2, but because of people bumping the
  // patch number instead of the wrap number, we're higher than that.
  // In fairness, there's no way to make an RC of a new version without
  // bumping the patch number.
  version: '1.11.4'
});

Package.onUse(function (api) {
  api.addFiles(['jquery.js', 'post.js'], 'client');

  api.export('$', 'client');
  api.export('jQuery', 'client');
});
