// This file exists because it is the file in the tool that is not automatically
// transpiled by Babel

function babelRegister() {
  var meteorBabel = require("meteor-babel");
  var path = require("path");
  var toolsPath = path.dirname(__dirname);
  var meteorPath = path.dirname(toolsPath);
  var cacheDir = path.join(meteorPath, ".babel-cache");

  meteorBabel.setCacheDir(cacheDir);

  require('meteor-babel/register')
    .allowDirectory(toolsPath)
    .setSourceMapRootPath(meteorPath);
}

babelRegister(); // #RemoveInProd this line is removed in isopack.js

require("./install-runtime.js");
