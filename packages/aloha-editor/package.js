Package.describe({
  summary: "Aloha Editor -- HTML5 contentEditable WYSIWYG editor"
});

Package.on_use(function (api) {
  //api.use('jquery');
  api.add_files('lib/require.js', 'client');
  api.add_files('lib/vendor/jquery-1.7.1.js', 'client');
  api.add_files('css/aloha.css', 'client');
  api.add_files('aloha-editor-config.js', 'client');
  api.add_files('lib/aloha.js', 'client');
});
