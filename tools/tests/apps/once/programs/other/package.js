Package.describe({
  version: "1.0.0",
  summary: "another program, for testing"
});

Package.on_use(function (api) {
  api.add_files(["other.js"], 'server');
});
