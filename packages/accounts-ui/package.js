Package.describe({
  summary: "Simple templates to add login widgets to an app."
});

Package.on_use(function (api) {
  api.use(['accounts', 'underscore', 'liveui', 'templating'], 'client');

  api.add_files([
    'login-buttons.css',
    'login-buttons-images.css',
    'login-buttons.html',
    'login-buttons.js'], 'client');
});
