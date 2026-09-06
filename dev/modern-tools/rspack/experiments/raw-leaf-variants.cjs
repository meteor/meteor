const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const sourceMap = require('../../../../dev_bundle/lib/node_modules/source-map');

const helperPath = path.resolve(__dirname, '../../../../tools/isobuild/compact-source-node.js');
const RAW_MODES = new Set(['raw-class', 'raw-own', 'raw-prototype']);
const PREFIX = '(function(){\n';
const SUFFIX = '\n})();\n';

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Compact leaf source changed; review experiment replacement');
  return source.replace(before, after);
}

/**
 * Change only the leaf allocation layout in an isolated copy of the committed
 * helper. Methods/prototypes are allocated once per module, never per fragment.
 * This diagnostic loader is not part of the normal linker implementation.
 */
function createRawVariant(mode) {
  if (!RAW_MODES.has(mode)) throw new Error(`Unknown raw leaf mode: ${mode}`);
  const original = fs.readFileSync(helperPath, 'utf8');
  let source = original;
  if (mode !== 'raw-class') {
    const start = source.indexOf('class CompactMappedLeaf {');
    const endMarker = 'CompactMappedLeaf.prototype[SOURCE_NODE_MARKER] = true;';
    const end = source.indexOf(endMarker, start);
    if (start < 0 || end < 0) throw new Error('Compact leaf implementation changed');
    const shared = `
function walk(callback) {
  if (this.code !== '') callback(this.code, this);
}
function walkSourceContents() {}
const LEAF_PROTOTYPE = { walk, walkSourceContents, [SOURCE_NODE_MARKER]: true };
function createMappedLeaf(line, column, source, code, name) {
  return {
    ${mode === 'raw-prototype' ? '__proto__: LEAF_PROTOTYPE,' : ''}
    line: line == null ? null : line,
    column: column == null ? null : column,
    source: source == null ? null : source,
    name: name == null ? null : name,
    code,
    ${mode === 'raw-own' ? 'walk, walkSourceContents, [SOURCE_NODE_MARKER]: true,' : ''}
  };
}
`;
    source = source.slice(0, start) + shared + source.slice(end + endMarker.length);
    source = replaceOnce(source, 'new CompactMappedLeaf(', 'createMappedLeaf(');
  }
  const isolated = new Module(helperPath, module);
  isolated.filename = helperPath;
  isolated.paths = Module._nodeModulePaths(path.dirname(helperPath));
  const originalRequire = isolated.require.bind(isolated);
  isolated.require = request => request === 'source-map' ? sourceMap : originalRequire(request);
  isolated._compile(source, helperPath);
  const helper = isolated.exports;
  const expand = helper.fromStringWithSourceMap;
  const serialize = tree => new sourceMap.SourceNode(null, null, null, [PREFIX, tree, SUFFIX])
    .toStringWithSourceMap({ file: 'wrapped.js' });
  return { helper, expand, serialize,
    render: (code, consumer) => serialize(expand(code, consumer)),
    metadata: { mode, helperSha256: crypto.createHash('sha256').update(original).digest('hex'),
      transformedSha256: crypto.createHash('sha256').update(source).digest('hex') } };
}

module.exports = { createRawVariant, RAW_MODES, helperPath };
