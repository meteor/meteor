Package.describe({
  summary: "Unstyled version of login widgets"
});

Package.on_use(function (api) {
  api.use(['accounts-urls', 'accounts-base', 'underscore', 'templating'], 'client');

  api.add_files([
    'login_buttons_images.css',
    'login_buttons.html',
    'login_buttons.js'], 'client');
});
