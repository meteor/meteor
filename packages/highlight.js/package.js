Package.describe({
  summary: "Code highlighting integrated with the markdown package",
  version: "1.0.0"
});

Npm.depends({
  "html-entities": "1.1.1"
});

Package.onUse(function (api) {
  api.addFiles("highlight.pack.js");
  api.addFiles("markdown-integration.js");
  api.addFiles("github.css");
  api.use("markdown", ["client", "server"], {weak: true});
  api.export("hljs");
});