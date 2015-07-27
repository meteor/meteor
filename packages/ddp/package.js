Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  version: '1.2.0-plugins.0'
});

Package.onUse(function (api) {
  api.use(['ddp-client'], ['client', 'server']);
  api.use(['ddp-server'], 'server');

  api.export('DDP');
  api.export('DDPServer', 'server');

  api.imply('ddp-client');
  api.imply('ddp-server');
});
