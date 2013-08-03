Package.describe({
  summary: "Interaction with the galaxy service for your apps"
});

Package.on_use(function (api) {
  api.use(['underscore', 'livedata']);
  api.use(['mongo-livedata'], {
    unordered: true
  });
  api.add_files(['galaxy.js'], 'server');
  api.export('Galaxy', 'server');
});
