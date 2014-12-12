Package.describe({
  summary: "A shell script for downloading the Meteor dev bundle",
  version: "1.0.2-rc.1"
});

Package.onUse(function (api) {
  api.export('DevBundleFetcher', 'server');
  api.addFiles(['dev-bundle', 'dev-bundle.js'], ['server']);
});
