Package.describe({
  summary: "Manipulate the DOM using CSS selectors",
  // This package currently uses jQuery 1.12.1, despite the version you
  // see here. Why default to 1.12.1? See issue #9605.
  version: '1.11.11'
});

Package.onUse(function (api) {
  api.use('modules');

  // Note that you can `meteor npm install jquery` (any version) into your
  // application's node_modules directory, and the meteor/jquery package
  // will use that version instead of 1.12.1.
  api.mainModule('main.js', 'client');

  api.export('$', 'client');
  api.export('jQuery', 'client');
});
