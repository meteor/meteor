Package.describe({
  summary: "Configure content security policies",
  version: "1.1.2"
});

Npm.depends({
  'lodash.isempty': '4.4.0',
  'lodash.has': '4.5.2',
  'lodash.union': '4.6.0'
});

Package.onUse(function (api) {
  api.use("modules");
  api.use(["browser-policy-common", "webapp"], "server");
  api.imply(["browser-policy-common"], "server");
  api.mainModule("browser-policy-content.js", "server");
});
