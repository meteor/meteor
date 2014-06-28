Package.describe({
  summary: "i18n implementation",
  internal: true
});

Package.on_use(function (api) {
  if(api.export) {
    api.use(['deps', 'ui'], ['client', 'server']);
    api.export(['i18n', '_$'], ['client', 'server']);
  }
  
  api.add_files(['i18n.js'], ['client', 'server']);
});








