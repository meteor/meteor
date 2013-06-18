Package.describe({
  summary: "A shell script for downloading the Meteor dev bundle",
  internal: true
});

Package._transitional_registerBuildPlugin({
  name: 'includeShScript',
  use: [],
  sources: [
    'plugins/shell.js'
  ]
});

Package.on_use(function (api) {
  api.add_files(['dev-bundle.sh.in', 'dev-bundle.js'], ['server']);
});
