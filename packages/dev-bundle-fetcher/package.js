Package.describe({
  summary: "A shell script for downloading the Meteor dev bundle",
  internal: true
});

Package.on_use(function (api) {
  api.export('DevBundleFetcher', 'server');
  api.add_files(['dev-bundle', 'dev-bundle.js'], ['server']);
});
