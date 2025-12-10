// This file exists because it is the file in the tool that is not automatically
// transpiled by Babel

"use strict";

function babelRegister() {
  const meteorBabel = require("@meteorjs/babel");
  const path = require("path");
  const toolsPath = path.dirname(__dirname);
  const meteorPath = path.dirname(toolsPath);
  const cacheDir = path.join(meteorPath, ".babel-cache");
  const babelOptions = meteorBabel.getDefaultOptions({
    nodeMajorVersion: parseInt(process.versions.node),
    typescript: true,
    useNativeAsyncAwait: true
  });

  // Make sure that source maps are included in the generated code for
  // meteor/tools modules.
  babelOptions.sourceMaps = "inline";

  require('@meteorjs/babel/register')
    .setCacheDirectory(cacheDir)
    .setSourceMapRootPath(meteorPath)
    .allowDirectory(toolsPath)
    .setBabelOptions(babelOptions)
    // Exclude files that are imported before we configure
    // meteor-babel/register (including this very file).
    .excludeFile(path.join(toolsPath, "index.js"))
    .excludeFile(path.join(__dirname, "install-reify.js"))
    .excludeFile(path.join(toolsPath, "cli", "dev-bundle-bin-commands.js"))
    .excludeFile(path.join(toolsPath, "cli", "dev-bundle-bin-helpers.js"))
    .excludeFile(path.join(toolsPath, "cli", "flush-buffers-on-exit-in-windows.js"))
    .excludeFile(path.join(toolsPath, "cli", "convert-to-os-path.js"))
    .excludeFile(__filename);
}

// Install reify first so babel falls back to it
require('./install-reify.js');

babelRegister(); // #RemoveInProd this line is removed in isopack.js

require("./install-runtime.js");
