var fs = Npm.require('fs');
var stylus = Npm.require('stylus');
var nib = Npm.require('nib');
var path = Npm.require('path');
var Future = Npm.require('fibers/future');

Plugin.registerSourceHandler("styl", function (compileStep) {
  // XXX annoying that this is replicated in .css, .less, and .styl
  if (! compileStep.archMatches('browser')) {
    // XXX in the future, might be better to emit some kind of a
    // warning if a stylesheet is included on the server, rather than
    // silently ignoring it. but that would mean you can't stick .css
    // at the top level of your app, which is kind of silly.
    return;
  }

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

