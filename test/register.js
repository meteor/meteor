var babelOptions = require("../options").getDefaults({
  modules: true,
  meteorAsyncAwait: true,
  react: true
});

babelOptions.whitelist.push("jscript");

require("../register")({
  babelOptions: babelOptions
});
