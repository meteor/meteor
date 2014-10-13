Package.describe({
  summary: "Maintain a connection to the leader of an election set",
  version: '1.0.2'
});

Package.on_use(function (api) {
  api.use(['logging', 'underscore', 'ddp', 'ejson']);
  api.add_files(['follower.js'], 'server');
  api.export('Follower');
});
