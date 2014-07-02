var fs = Npm.require('fs');
var path = Npm.require('path');
var Future = Npm.require('fibers/future');

Plugin.registerSourceHandler("css", function (compileStep) {
  if (! compileStep.archMatches('client')) {
    return;
  }
  console.log("HELLO");
  // var source = compileStep.read().toString('utf8');
  // var options = {
  //   filename: compileStep.inputPath,
  //   // Use fs.readFileSync to process @imports. This is the bundler, so
  //   // that's not going to cause concurrency issues, and it means that (a)
  //   // we don't have to use Futures and (b) errors thrown by bugs in less
  //   // actually get caught.
  //   syncImport: true,
  //   paths: [path.dirname(compileStep._fullInputPath)] // for @import
  // };

  // var parser = new less.Parser(options);
  // var astFuture = new Future;
  // var sourceMap = null;
  // try {
  //   parser.parse(source, astFuture.resolver());
  //   var ast = astFuture.wait();

  //   var css = ast.toCSS({
  //     sourceMap: true,
  //     writeSourceMap: function (sm) {
  //       sourceMap = JSON.parse(sm);
  //     }
  //   });
  // } catch (e) {
  //   // less.Parser.parse is supposed to report any errors via its
  //   // callback. But sometimes, it throws them instead. This is
  //   // probably a bug in less. Be prepared for either behavior.
  //   compileStep.error({
  //     message: "Less compiler error: " + e.message,
  //     sourcePath: e.filename || compileStep.inputPath,
  //     line: e.line,
  //     column: e.column + 1
  //   });
  //   return;
  // }


  // if (sourceMap) {
  //   sourceMap.sources = [compileStep.inputPath];
  //   sourceMap.sourcesContent = [source];
  //   sourceMap = JSON.stringify(sourceMap);
  // }

  // compileStep.addStylesheet({
  //   path: compileStep.inputPath + ".css",
  //   data: css,
  //   sourceMap: sourceMap
  // });
});
