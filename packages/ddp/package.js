Package.describe({
  summary: "Meteor's latency-compensated distributed data framework",
  version: '1.4.2-rc300.1',
});

Package.onUse(function (api) {
  api.use(['ddp-client'], ['client', 'server']);
  api.use(['ddp-server'], 'server');

  api.addAssets('ddp.d.ts', 'server');

  api.export('DDP');
  api.export('DDPServer', 'server');

  api.imply('ddp-client');
  api.imply('ddp-server');
});
