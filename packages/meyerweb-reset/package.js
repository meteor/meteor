// This package is a hack to get reset.css loaded before other css
// files. I've marked it internal because I'm not sure if we want to
// encourage this pattern. Maybe another solution would be better.
Package.describe({
  summary: "reset.css v2.0 from http://meyerweb.com/eric/tools/css/reset/",
  version: "1.0.4"
});

Package.onUse(function (api) {
  api.addFiles("reset.css", "client");
});
