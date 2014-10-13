Package.describe({
  summary: "Publish internal app statistics",
  version: '1.0.2'
});

Package.on_use(function (api) {
  api.use(['underscore'], ['client', 'server']);
  api.use(['templating', 'mongo', 'ddp'], ['client']);

  // Detect whether autopublish is used.
  api.use('autopublish', 'server', {weak: true});

  // Unordered dependency on livedata, since livedata has a (weak) dependency on
  // us.
  api.use('ddp', 'server', {unordered: true});

  api.add_files('facts.html', ['client']);
  api.add_files('facts.js', ['client', 'server']);

  api.export('Facts');
});
