Package.describe({
  summary: "Simple templates to add login widgets to an app."
});

Package.on_use(function (api) {
  api.use(['accounts', 'underscore', 'liveui', 'templating'], 'client');

  api.add_files([
    'login_buttons.css',
    'login_buttons_images.css',
    'login_buttons.html',
    'login_buttons.js'], 'client');
});
