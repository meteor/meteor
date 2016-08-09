Package.describe({
  summary: "Configure content security policies",
  version: "1.0.11",
  git: 'https://github.com/meteor/meteor/tree/master/packages/browser-policy-content'
});

Package.onUse(function (api) {
  api.imply(["browser-policy-common"], "server");
  api.addFiles("browser-policy-content.js", "server");
  api.use(["underscore", "browser-policy-common", "webapp"], "server");
});
