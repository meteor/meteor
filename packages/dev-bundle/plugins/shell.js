var path = Npm.require('path');

// This is a big hack: the plugin reads the shell script, sticks the contents in
// a JS object, and writes the object to a Javascript file. This won't be
// necessary when we can include static server resources in the bundle.
var handler = function (compileStep) {
  var source = compileStep.read().toString('utf8');
  var source_obj = { source: source };
  var filename = path.basename(compileStep.inputPath);
  var target = compileStep.inputPath + '.js';
  var code = '//@export shellScripts\nif (! shellScripts) shellScripts = {};';
  code = code + '\nshellScripts["' + filename + '"] =' +
    JSON.stringify(source_obj) + ';';
  compileStep.addJavaScript({
    path: target,
    data: code,
    sourcePath: compileStep.inputPath,
    lineForLine: false
  });
};

Plugin.registerSourceHandler('in', handler);
