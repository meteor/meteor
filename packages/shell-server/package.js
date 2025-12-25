Package.describe({
  name: "shell-server",
  version: '0.7.0-rc340.2',
  summary: "Server-side component of the `meteor shell` command.",
  documentation: "README.md",
  devOnly: true,
});

Package.onUse(function(api) {
  api.use("ecmascript", "server");
  api.use("babel-compiler", "server");
  api.mainModule("main.js", "server");
});
