Package.describe({
  summary: 'Expressive, dynamic, robust CSS.'
});

Npm.depends({stylus: "0.30.1", nib: "0.8.2"});

Package.register_extension(
  'styl', function(bundle, source_path, serve_path, where) {
    var stylus = Npm.require('stylus');
    var nib = Npm.require('nib');
    var fs = Npm.require('fs');

    serve_path = serve_path + '.css';

    var contents = fs.readFileSync(source_path);

    stylus(contents.toString('utf8'))
    .use(nib())
    .set('filename', source_path)
    .render(function(err, css) {
      if (err) {
        bundle.error('Stylus compiler error: ' + err.message);
        return;
      }
      bundle.add_resource({
        type: 'css',
        path: serve_path,
        data: new Buffer(css),
        where: where
      });
    });
  }
);

Package.on_test(function (api) {
  api.add_files(['stylus_tests.styl', 'stylus_tests.js'], 'client');
});
