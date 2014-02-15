var fs = Npm.require('fs');
var path = Npm.require('path');
var less = Npm.require('less');
var Future = Npm.require('fibers/future');

Plugin.registerSourceHandler("less", function (compileStep) {
  // XXX annoying that this is replicated in .css, .less, and .styl
  if (! compileStep.archMatches('browser')) {
    // XXX in the future, might be better to emit some kind of a
    // warning if a stylesheet is included on the server, rather than
    // silently ignoring it. but that would mean you can't stick .css
    // at the top level of your app, which is kind of silly.
    return;
  }

  var source = compileStep.read().toString('utf8');
  var options = {
    // Use fs.readFileSync to process @imports. This is the bundler, so
    // that's not going to cause concurrency issues, and it means that (a)
    // we don't have to use Futures and (b) errors thrown by bugs in less
    // actually get caught.
    syncImport: true,
    paths: [path.dirname(compileStep._fullInputPath)] // for @import
  };

  var parser = new less.Parser(options);
  var astFuture = new Future;
  var ast;
  try {
    parser.parse(source, astFuture.resolver());
    ast = astFuture.wait();
  } catch (e) {
    // less.Parser.parse is supposed to report any errors via its
    // callback. But sometimes, it throws them instead. This is
    // probably a bug in less. Be prepared for either behavior.
    compileStep.error({
      message: "Less compiler error: " + e.message,
      sourcePath: e.filename || compileStep.inputPath,
      line: e.line - 1,  // dunno why, but it matches
      column: e.column + 1
    });
    return;
  }

  var cssFuture = new Future;
  var css = ast.toCSS({
    sourceMap: Boolean(true),
    writeSourceMap: function (sourceMap) {
      cssFuture.return(sourceMap);
    }
  });

  var sourceMap = JSON.parse(cssFuture.wait());

  sourceMap.sources = [compileStep.inputPath];
  sourceMap.sourcesContent = [source];

  compileStep.addStylesheet({
    path: compileStep.inputPath + ".css",
    data: css,
    sourceMap: JSON.stringify(sourceMap)
  });
});;

// Register import.less files with the dependency watcher, without actually
// processing them. There is a similar rule in the stylus package.
Plugin.registerSourceHandler("import.less", function () {
  // Do nothing
});

// Backward compatibility with Meteor 0.7
Plugin.registerSourceHandler("lessimport", function () {});
