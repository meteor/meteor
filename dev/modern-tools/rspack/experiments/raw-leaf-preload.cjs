const Module = require('node:module');
const { createRawVariant, helperPath } = require('./raw-leaf-variants.cjs');
const variant = createRawVariant(process.env.METEOR_RAW_LEAF_VARIANT);
const originalLoad = Module._load;
let reported = false;

// Intercept only the internal helper. The class control uses the same loader so
// comparisons include its overhead. No dependency or checkout source is edited.
Module._load = function(request, parent, isMain) {
  if ((request.includes('compact-source-node') || request === helperPath) &&
      Module._resolveFilename(request, parent, isMain) === helperPath) {
    if (!reported) {
      process.stderr.write('[raw-leaf-experiment] ' + JSON.stringify(variant.metadata) + '\n');
      reported = true;
    }
    return variant.helper;
  }
  return originalLoad.apply(this, arguments);
};
