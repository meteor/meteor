Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  version: '1.2.2'
});

Package.onUse(function (api) {
  api.use(['ddp-client'], ['client', 'server']);
  api.use(['ddp-server'], 'server');

  api.export('DDP');
  api.export('DDPServer', 'server');

  api.imply('ddp-client');
  api.imply('ddp-server');
});
