Package.describe({
  summary: "Reload safety belt for galaxy apps",
  internal: true
});

Package.on_use(function (api) {
  api.add_files("reload-safety-belt.js", "server");
  api.export("ReloadSafetyBelt", "server");
});
