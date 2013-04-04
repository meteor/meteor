Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons"
});

Npm.depends({"coffee-script": "1.5.0"});

var coffeescript_handler = function(bundle, source_path, serve_path, where) {
  var fs = Npm.require('fs');
  var path = Npm.require('path');
  var coffee = Npm.require('coffee-script');
  serve_path = serve_path + '.js';

  var contents = fs.readFileSync(source_path);
  var options = {bare: true, filename: source_path, literate: path.extname(source_path) === '.litcoffee'};
  try {
    contents = coffee.compile(contents.toString('utf8'), options);
  } catch (e) {
    return bundle.error(e.message);
  }

  contents = new Buffer(contents);
  bundle.add_resource({
    type: "js",
    path: serve_path,
    data: contents,
    where: where
  });
}

Package.register_extension("coffee", coffeescript_handler);
Package.register_extension("litcoffee", coffeescript_handler);

Package.on_test(function (api) {
  api.add_files(['coffeescript_tests.coffee', 'litcoffeescript_tests.litcoffee', 'coffeescript_tests.js'],
                ['client', 'server']);
});
