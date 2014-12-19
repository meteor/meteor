Package.describe({
  summary: "Maintain a connection to the leader of an election set",
  version: '1.0.3'
});

Package.onUse(function (api) {
  api.use(['logging', 'underscore', 'ddp', 'ejson']);
  api.addFiles(['follower.js'], 'server');
  api.export('Follower');
});
