Package.describe({
  summary: "Maintain a connection to the leader of an election set"
});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata', 'ejson']);
  api.add_files(['follower.js'], 'server');
  api.export('Follower');
});
