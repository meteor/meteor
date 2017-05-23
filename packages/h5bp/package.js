Package.describe({
  summary: "The HTML5 Boilerplate",
});

Package.on_use(function (api) {
  api.add_files('style.css', 'client');
  api.add_files('humans.txt', 'client');
  api.add_files('.htaccess', 'client');
  api.add_files('crossdomain.xml', 'client');
  api.add_files('robots.txt', 'client');
});
