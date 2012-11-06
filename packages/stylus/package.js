Package.describe({
  summary: 'Expressive, dynamic, robust CSS.'
});

var stylus = require('stylus');
var nib = require('nib');
var fs = require('fs');

Package.register_extension(
  'styl', function(bundle, source_path, serve_path, where) {
    // ignore this file if it starts with an _, 
    // it's file that will be included by others.
    if (source_path.match(/\/_[^\/]*$/))
      return;
    
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
