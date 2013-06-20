var fs = Npm.require('fs');
var path = Npm.require('path');
var coffee = Npm.require('coffee-script');

var handler = function (compileStep) {
  var source = compileStep.read().toString('utf8');
  var options = {
    bare: true,
    filename: compileStep.inputPath,
    literate: path.extname(compileStep.inputPath) === '.litcoffee'
  };

  try {
    var output = coffee.compile(source, options);
  } catch (e) {
    // XXX better error handling, once the Plugin interface support it
    throw new Error(
      compileStep.inputPath + ':' +
      (e.location ? (e.location.first_line + ': ') : ' ') +
      e.message
    );
  }

  // We want the symbol "share" to be visible to all CoffeeScript files in the
  // package (and shared between them), but not visible to JavaScript
  // files. (That's because we don't want to introduce two competing ways to
  // make package-local variables into JS ("share" vs assigning to non-var
  // variables).) The following hack accomplishes that: "__coffeescriptShare"
  // will be visible at the package level and "share" at the file level.  This
  // should work both in "package" mode where __coffeescriptShare will be added
  // as a var in the package closure, and in "app" mode where it will end up as
  // a global.
  //
  // We need a newline after this (which may require a source map to be
  // adjusted), to not conflict with stripVarFromExports.
  output = ("__coffeescriptShare = typeof __coffeescriptShare === 'object' ? __coffeescriptShare : {}; " +
            "var share = __coffeescriptShare;\n" + output);

  compileStep.addJavaScript({
    path: compileStep.inputPath + ".js",
    sourcePath: compileStep.inputPath,
    data: output,
    lineForLine: false,
    stripVarFromExports: true
  });
};

Plugin.registerSourceHandler("coffee", handler);
Plugin.registerSourceHandler("litcoffee", handler);

