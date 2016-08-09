Package.describe({
  summary: "Restrict which websites can frame your app",
  version: "1.0.11",
  git: 'https://github.com/meteor/meteor/tree/master/packages/browser-policy-framing'
});

Package.onUse(function (api) {
  api.imply(["browser-policy-common"], "server");
  api.use(["underscore", "browser-policy-common"], "server");
  api.addFiles("browser-policy-framing.js", "server");
});
