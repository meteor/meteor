Package.describe({
  summary: "Opt out of sending package stats",
  version: '1.0.1'
});

Package.on_use(function (api) {
  // Empty. This package's presence tells the meteor tool to stop
  // sending package stats.
});
