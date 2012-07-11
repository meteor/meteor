Package.describe({
  summary: "Adds support for LiveScript, a derivative of Coco which is a derivative of Coffeescript http://gkz.github.com/LiveScript."
});

var ls = require('livescript');
var fs = require('fs');

Package.register_extension(
  "livescript", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.js';

    var contents = fs.readFileSync(source_path);
    var options = {bare: true};
    contents = new Buffer(ls.compile(contents.toString('utf8'), options));
    // XXX report coffee compile failures better?

    bundle.add_resource({
      type: "js",
      path: serve_path,
      data: contents,
      where: where
    });
  }
);

Package.on_test(function (api) {
  api.add_files(['livescript_tests.ls', 'livescript_tests.js'],
                ['client', 'server']);
});
