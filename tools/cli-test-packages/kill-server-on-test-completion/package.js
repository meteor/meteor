Package.describe({
  summary: "Kill a server spawned with --once on test completion, after printing results"
});

Package.on_test(function (api) {
  api.add_files('tests_complete_hook.js', ['client', 'server']);
});
