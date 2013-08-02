var fs = Npm.require('fs');
var path = Npm.require('path');
var less = Npm.require('less');

Plugin.registerSourceHandler("less", function (compileStep) {
  var source = compileStep.read().toString('utf8');
  var options = {
    // Use fs.readFileSync to process @imports. This is the bundler, so
    // that's not going to cause concurrency issues, and it means that (a)
    // we don't have to use Futures and (b) errors thrown by bugs in less
    // actually get caught.
    syncImport: true,
    paths: [path.dirname(compileStep._fullInputPath)] // for @import
  };

  try {
    less.render(source, options, function (err, css) {
      if (err) {
        // XXX better error handling, once the Plugin interface support it
        throw new Error(err.message);
      }

      compileStep.addStylesheet({
        path: compileStep.inputPath + ".css",
        data: css
      });
    });
  } catch (e) {
    // less.render() is supposed to report any errors via its
    // callback. But sometimes, it throws them instead. This is
    // probably a bug in less. Be prepared for either behavior.
    throw new Error(compileStep.inputPath + ": Less compiler error: " + e.message);
  }
});;

// Register lessimport files with the dependency watcher, without actually
// processing them.
Plugin.registerSourceHandler("lessimport", function () {
  // Do nothing
});
