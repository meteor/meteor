Package.describe({
  summary: "Adaptor for using MongoDB and Minimongo over DDP",
  version: '1.0.4-rc0'
});

Package.on_use(function (api) {
  api.imply("mongo");
});
