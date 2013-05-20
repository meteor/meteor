Package.describe({
  summary: "A shell script for downloading the Meteor dev bundle"
});

Package._transitional_registerBuildPlugin({
  name: 'includeShScript',
  use: [],
  sources: [
    'plugins/shell.js'
  ]
});

Package.on_use(function (api) {
  api.add_files(['dev-bundle.sh.in'], ['server']);
});
