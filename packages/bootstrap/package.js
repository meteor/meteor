Package.describe({
  summary: "UX/UI framework from Twitter"
})

var fs = require('fs');

Package.on_use(function (api) {
  api.add_files('css/bootstrap.css', 'client');
  api.add_files('css/bootstrap-responsive.css', 'client');
  api.add_files('js/bootstrap.js', 'client');
  api.add_files('img/glyphicons-halflings.png', 'client');
  api.add_files('img/glyphicons-halflings-white.png', 'client');
});

// handle adding PNG sprites for icons
Package.register_extension(
  "png", function(bundle, source_path, serve_path, where) {

    var png = fs.readFileSync(source_path)

    bundle.add_resource({
      type: "img",
      path: serve_path,
      data : png,
      where: where
    });
  }
);
