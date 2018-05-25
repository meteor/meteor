// This file exists because it is the file in the tool that is not automatically
// transpiled by Babel

"use strict";

function babelRegister() {
  const meteorBabel = require("meteor-babel");
  const path = require("path");
  const toolsPath = path.dirname(__dirname);
  const meteorPath = path.dirname(toolsPath);
  const cacheDir = path.join(meteorPath, ".babel-cache");
  const babelOptions = meteorBabel.getDefaultOptions({
    nodeMajorVersion: parseInt(process.versions.node)
  });

  // Make sure that source maps are included in the generated code for
  // meteor/tools modules.
  babelOptions.sourceMaps = "inline";

  require('meteor-babel/register')
    .setCacheDirectory(cacheDir)
    .allowDirectory(toolsPath)
    .setSourceMapRootPath(meteorPath)
    .setBabelOptions(babelOptions);
}

babelRegister(); // #RemoveInProd this line is removed in isopack.js

require("./install-runtime.js");
