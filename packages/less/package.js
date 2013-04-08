Package.describe({
  summary: "The dynamic stylesheet language."
});

Npm.depends({less: '1.3.3'});

Package.register_extension(
  "less", function (bundle, source_path, serve_path, where) {
    var fs = Npm.require('fs');
    var path = Npm.require('path');
    var less = Npm.require('less');

    var render = function(lessContent, lastError){
      
      // If the dependency isn't found, try to search a `.lessimport` file
      if(typeof lastError !== "undefined" && lastError.indexOf("wasn't found.") !== -1){
        fileToImport = lastError.split("'")[1];
        fileToImport = fileToImport.replace(".less", "")
        lessContent = lessContent.replace(fileToImport, fileToImport + ".lessimport");
      }

      try {
        less.render(lessContent, {
          // Use fs.readFileSync to process @imports. This is the bundler, so
          // that's not going to cause concurrency issues, and it means that (a)
          // we don't have to use Futures and (b) errors thrown by bugs in less
          // actually get caught.
          syncImport: true,
          paths: [path.resolve(source_path, '..')] // for @import
        }, function(error, content) {

          if(error !== null && error !== lastError) {
            render(lessContent, error);
          } else if(!! content) {
            bundle.add_resource({
              type: "css",
              path: serve_path + ".css",
              data: new Buffer(content),
              where: where
            });
          } else {
            bundle.error(source_path + ": Less compiler error: " + error);
          }
        });
      
      } catch (error) {
        // less.render() is supposed to report any errors via its
        // callback. But sometimes, it throws them instead. This is
        // probably a bug in less. Be prepared for either behavior.
        if (error.message !== lastError) {
          render(lessContent, error.message);
        } else {
          bundle.error(source_path + ": Less compiler error: " + error.message);
        }
      }
    };

    var contents = fs.readFileSync(source_path, 'utf8').toString('utf8');
    render(contents);
  }
);

// Register lessimport files with the dependency watcher, without actually
// processing them.
Package.register_extension("lessimport", function () {});

Package.on_test(function (api) {
  api.use('test-helpers');
  api.add_files(['less_tests.less', 'less_tests.js'], 'client');
});
