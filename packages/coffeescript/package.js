Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons"
});

Npm.depends({"coffee-script": "1.6.1"});

var coffeescript_handler = function(bundle, source_path, serve_path, where, literate) {
  var fs = Npm.require('fs');
  var path = Npm.require('path');
  var coffee = Npm.require('coffee-script');
  var options = {
    bare: true,
    sourceMap: true,
    filename: source_path,
    literate: literate
  };  

  // Compile from CoffeeScript to JavaScript
  var coffeeContent = fs.readFileSync(source_path).toString('utf8');
  try {
    var contents = coffee.compile(coffeeContent, options);
    var jsContent = new Buffer(contents.js);
  } catch (e) {
    return bundle.error(e.message);
  }

  if (options.sourceMap) {
    // Bundle the non-compiled CoffeeScript file
    bundle.add_resource({
      type: "static", // WARNING : Seems to doesn't be updated on client reloading
      path: serve_path,
      data: coffeeContent,
      where: where
    });

    // Add the Source Map link
    var mapPath = serve_path + ".map";
    jsContent += "//@ sourceMappingURL=" + mapPath;

    // Bundle the Source Map
    var srcMapContent = contents.v3SourceMap.replace(".js", ".coffee.js");
    bundle.add_resource({
      type: "static", // WARNING : Seems to doesn't be updated on client reloading
      path: mapPath,
      data: srcMapContent,
      where: where
    });
  }

  // Bundle the compiled JavaScript file
  bundle.add_resource({
    type: "js",
    path: serve_path + ".js",
    data: jsContent,
    where: where
  });
}

Package.register_extension("coffee", function(bundle, source_path, serve_path, where) {
  coffeescript_handler(bundle, source_path, serve_path, where, false);
});
Package.register_extension("litcoffee", function(bundle, source_path, serve_path, where) {
  coffeescript_handler(bundle, source_path, serve_path, where, true);
});
Package.register_extension("coffee.md", function(bundle, source_path, serve_path, where) {
  coffeescript_handler(bundle, source_path, serve_path, where, true);
});

Package.on_test(function (api) {
  api.add_files(['coffeescript_tests.coffee', 'litcoffeescript_tests.litcoffee', 'litcoffeescript_tests.coffee.md', 'coffeescript_tests.js'],
                ['client', 'server']);
});
