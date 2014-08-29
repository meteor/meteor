Package.describe({
  summary: "On Cordova, only allow the app to reload when the app is resumed.",
  version: '1.0.0-cordova1'
});

Package.on_use(function (api) {
  api.use(['reload', 'deps'], 'web.cordova');
  api.add_files("reload-on-resume.js", 'web.cordova');
});
