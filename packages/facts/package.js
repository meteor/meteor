Package.describe({
  summary: "Publish internal app statistics",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore'], ['client', 'server']);
  api.use(['templating', 'mongo-livedata', 'livedata'], ['client']);

  // Detect whether autopublish is used.
  api.use('autopublish', 'server', {weak: true});

  // Unordered dependency on livedata, since livedata has a (weak) dependency on
  // us.
  api.use('livedata', 'server', {unordered: true});

  api.add_files('facts.html', ['client']);
  api.add_files('facts.js', ['client', 'server']);

  api.export('Facts');
});

