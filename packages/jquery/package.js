Package.describe({
  summary: "Manipulate the DOM using CSS selectors",

  // XXX WHOOPS!  We accidentally published jquery 1.11.2 as 1.11.3, because we
  // naively thought that "call the version '1.11.2', add a comment saying that
  // the next version should be '1.11.2_1'" would be sufficient to not be
  // missed during the semi-automated version number bumping step. Next time, use `_0` from the start so it's obvious that something weird is happening!
  version: '1.11.3_2'  // XXX see above!!!!
});

Package.onUse(function (api) {
  api.addFiles(['jquery.js', 'post.js'], 'client');

  api.export('$', 'client');
  api.export('jQuery', 'client');
});
