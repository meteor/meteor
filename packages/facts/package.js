Package.describe({
  summary: "Publish internal app statistics",
  version: '1.0.10'
});

Package.onUse(function (api) {
  api.use(['facts-base', 'facts-ui']);

  api.imply('facts-base');
  api.imply('facts-ui');
  api.export(['Facts', 'FACTS_COLLECTION', 'FACTS_PUBLICATION']);
});
