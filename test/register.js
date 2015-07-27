var babelOptions = require("../options").getDefaults({
  modules: true,
  meteorAsyncAwait: true,
  react: true,
  jscript: true
});

require("../register")({
  babelOptions: babelOptions
});
