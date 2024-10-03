Package.describe({
  summary: "Manipulate the DOM using CSS selectors",
  version: '3.0.2'
});

Package.onUse(function (api) {
  api.versionsFrom(['2.16', '3.0.3']);
  api.use('modules');

  // Note that you can `meteor npm install jquery` (any version) into your
  // application's node_modules directory, and the meteor/jquery package
  // will use that version instead of 1.12.1.
  api.mainModule('main.js', 'client');

  api.export('$', 'client');
  api.export('jQuery', 'client');
});
