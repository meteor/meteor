let cacheDir;

if (process.env.METEOR_TOOL_ENABLE_REIFY_RUNTIME_CACHE === 'true') {
  const path = require("path");
  const toolsPath = path.dirname(__dirname);
  const meteorPath = path.dirname(toolsPath);
  cacheDir = path.join(meteorPath, ".reify-cache");
}

// Enable the Reify module runtime: Module.prototype.{link,export,...}.
// The same runtime.js code is used by server code (see boot.js).
require("../static-assets/server/runtime.js")({ cachePath: cacheDir });
