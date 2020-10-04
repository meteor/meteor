Package.describe({
  summary: "Publish internal app statistics",
  version: '1.0.9'
});

Package.onUse(function (api) {
  api.use(['underscore'], ['client', 'server']);
  api.use(['templating@1.2.13', 'mongo', 'ddp'], ['client']);

  // Detect whether autopublish is used.
  api.use('autopublish', 'server', {weak: true});

  // Unordered dependency on livedata, since livedata has a (weak) dependency on
  // us.
  api.use('ddp', 'server', {unordered: true});

  api.addFiles('facts.html', ['client']);
  api.addFiles('facts.js', ['client', 'server']);

  api.export('Facts');
});
