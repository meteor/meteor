Package.describe({
  summary: "Base64 encoding and decoding",
  version: "1.0.12",
});

Npm.depends({
  "@trusktr/meteor-base64": "1.0.12",
});

Package.onUse((api) => {
  api.export("Base64");
  api.use("ecmascript");
  api.mainModule("base64.js");
});

Package.onTest((api) => {
  api.use(["typescript", "tinytest", "ejson"]);
  api.addFiles("base64_test.ts", ["client", "server"]);
});
