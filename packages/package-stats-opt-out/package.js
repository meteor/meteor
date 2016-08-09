Package.describe({
  summary: "Opt out of sending package stats",
  version: '1.0.7',
  git: 'https://github.com/meteor/meteor/tree/master/packages/package-stats-opt-out'
});

Package.onUse(function (api) {
  // Empty. This package's presence tells the meteor tool to stop
  // sending package stats.
});
