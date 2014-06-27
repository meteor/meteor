Package.describe({
  summary: "i18n implementation",
  internal: true
});

Package.on_use(function (api) {
  if(api.export) {
    api.use(['deps', 'ui'], ['client', 'server']);
    api.export('i18n', ['client', 'server']);
  }
  api.export('_$');
  api.add_files(['i18n.js'], ['client', 'server']);
});






