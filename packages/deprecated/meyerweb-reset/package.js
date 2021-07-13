// This package is a hack to get reset.css loaded before other css
// files. I've marked it internal because I'm not sure if we want to
// encourage this pattern. Maybe another solution would be better.
Package.describe({
  summary: "(Deprecated) reset.css v2.0 from http://meyerweb.com/eric/tools/css/reset/",
  version: "2.0.0",
  deprecated: true,
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.addFiles('deprecation_notice.js', 'server');
});
