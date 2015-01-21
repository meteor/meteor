Package.describe({
  summary: "Maintain a connection to the leader of an election set",
  version: '1.0.4-winr.2'
});

Package.onUse(function (api) {
  api.use(['logging', 'underscore', 'ddp', 'ejson']);
  api.addFiles(['follower.js'], 'server');
  api.export('Follower');
});
