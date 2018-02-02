Package.describe({
  summary: "Publish internal app statistics",
  version: '0.0.1'
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.use('underscore', 'server');

  // Detect whether autopublish is used.
  api.use('autopublish', 'server', {weak: true});

  // Unordered dependency on livedata, since livedata has a (weak) dependency on
  // us.
  api.use('ddp', 'server', {unordered: true});

  api.mainModule('facts_base_server.js', 'server');
  api.mainModule('facts_base_both.js', 'client');

  api.export(['Facts', 'FACTS_COLLECTION', 'FACTS_PUBLICATION']);
});
