Package.describe({
  summary: "another program, for testing"
});

Package.on_use(function (api) {
  api.add_files(["other.js"], 'server');
});
