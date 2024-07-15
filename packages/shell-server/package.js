Package.describe({
  name: "shell-server",
  version: '0.6.0-rc300.10',
  summary: "Server-side component of the `meteor shell` command.",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("ecmascript", "server");
  api.use("babel-compiler", "server");
  api.mainModule("main.js", "server");
});
