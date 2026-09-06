const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../../../../dev_bundle/lib/node_modules/typescript');
const sourceMap = require('../../../../dev_bundle/lib/node_modules/source-map');
const streamingPath = path.resolve(__dirname, '../../../../tools/isobuild/experiments/streaming-source-node.ts');
let loaded;

// Standalone experiments use the same compiler version as Meteor, with CommonJS
// emission for plain Node. Strict checking is a separate required tsc command.
function loadStreaming() {
  if (loaded) return loaded;
  const output = ts.transpileModule(fs.readFileSync(streamingPath, 'utf8'), {
    fileName: streamingPath,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  const isolated = new Module(streamingPath, module);
  isolated.filename = streamingPath;
  isolated.paths = Module._nodeModulePaths(path.dirname(streamingPath));
  const originalRequire = isolated.require.bind(isolated);
  isolated.require = request => request === 'source-map' ? sourceMap : originalRequire(request);
  isolated._compile(output.outputText, streamingPath);
  loaded = isolated.exports;
  return loaded;
}

module.exports = { loadStreaming, streamingPath };
