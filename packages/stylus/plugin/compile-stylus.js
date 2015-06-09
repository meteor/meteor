var fs = Npm.require('fs');
var stylus = Npm.require('stylus');
var nib = Npm.require('nib');
var path = Npm.require('path');
var Future = Npm.require('fibers/future');

// XXX BBP probably rewrite to registerCompiler even if we can't implement
// good @imports because stylus doesn't let you override @import processing.
// (maybe deprecate this package?  put out a call for PRs?)
Plugin.registerSourceHandler("styl", {archMatching: 'web'}, function (compileStep) {
  var f = new Future;
  stylus(compileStep.read().toString('utf8'))
    .use(nib())
    .set('filename', compileStep.inputPath)
    // Include needed to allow relative @imports in stylus files
    .include(path.dirname(compileStep._fullInputPath))
    .render(f.resolver());

  try {
    var css = f.wait();
  } catch (e) {
    compileStep.error({
      message: "Stylus compiler error: " + e.message
    });
    return;
  }
  compileStep.addStylesheet({
    path: compileStep.inputPath + ".css",
    data: css
  });
});

// Register import.styl files with the dependency watcher, without actually
// processing them. There is a similar rule in the less package.
Plugin.registerSourceHandler("import.styl", function () {
  // Do nothing
});

