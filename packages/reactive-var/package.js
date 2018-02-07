Package.describe({
  summary: 'Reactive variable',
  version: '1.0.12'
});

Package.onUse(function (api) {
  api.export('ReactiveVar');

  api.use(['tracker', 'ecmascript']);

  api.mainModule('reactive-var.js');
});
