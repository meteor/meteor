Package.describe({
  summary: "Opt out of sending package stats",
  version: '2.0.0-alpha300.10',
});

Package.onUse(function (api) {
  // Empty. This package's presence tells the meteor tool to stop
  // sending package stats.
});
