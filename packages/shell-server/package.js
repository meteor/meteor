Package.describe({
  name: "shell-server",
  version: "0.2.3",
  summary: "Server-side component of the `meteor shell` command.",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("ecmascript@0.5.7", "server");
  api.mainModule("main.js", "server");
});
