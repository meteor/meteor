const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const sourceMap = require('../../../../dev_bundle/lib/node_modules/source-map');
const sourcePath = require.resolve('../../../../dev_bundle/lib/node_modules/source-map/lib/source-node');
const util = require('../../../../dev_bundle/lib/node_modules/source-map/lib/util');

const PREFIX = '(function(){\n';
const SUFFIX = '\n})();\n';
const LOCATION = Object.freeze({ source: null, line: null, column: null, name: null });
const MODES = new Set(['baseline', 'lazy-metadata', 'compact', 'stream', 'proxy']);

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Unexpected source-map implementation: ${before}`);
  return source.replace(before, after);
}

/**
 * Load isolated representations without modifying the installed library.
 * Compact leaves support only construction, walking and serialization used by
 * this experiment, not the complete mutable SourceNode API. Streaming uses the
 * original segmentation and generator algorithms but emits each segment directly.
 * Checked replacements make changes in the installed implementation fail loudly.
 */
function createVariant(mode, observe = value => value) {
  if (mode.startsWith('raw-')) {
    return require('./raw-leaf-variants.cjs').createRawVariant(mode);
  }
  if (!MODES.has(mode)) throw new Error(`Unknown representation: ${mode}`);
  let SourceNode = sourceMap.SourceNode;
  if (mode !== 'baseline') {
    let source = fs.readFileSync(sourcePath, 'utf8');
    if (mode === 'lazy-metadata') {
      source = 'const EMPTY_CONTENTS = Object.freeze({});\n' + source;
      source = replaceOnce(source, 'this.sourceContents = {};', 'this.sourceContents = EMPTY_CONTENTS;');
      source = replaceOnce(source, 'setSourceContent(aSourceFile, aSourceContent) {',
        'setSourceContent(aSourceFile, aSourceContent) {\n' +
        '    if (this.sourceContents === EMPTY_CONTENTS) this.sourceContents = {};');
    }
    if (mode === 'compact' || mode === 'stream') {
      source = `
class CompactSourceNodeLeaf {
  constructor(line, column, source, code, name) {
    this.line = line == null ? null : line;
    this.column = column == null ? null : column;
    this.source = source == null ? null : source;
    this.name = name == null ? null : name;
    this.code = code;
  }
  walk(callback) { if (this.code !== '') callback(this.code, this); }
  walkSourceContents() {}
}
CompactSourceNodeLeaf.prototype['$$$isSourceNode$$$'] = true;
` + source;
      source = replaceOnce(source, 'node.add(new SourceNode(mapping.originalLine,',
        'node.add(new CompactSourceNodeLeaf(mapping.originalLine,');
    }
    if (mode === 'stream') {
      source = replaceOnce(source,
        'static fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath) {',
        'static fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath, sink) {');
      source = replaceOnce(source, 'const node = new SourceNode();', 'const node = sink;');
    }
    if (mode === 'proxy') {
      source = replaceOnce(source, 'if (aChunks != null) this.add(aChunks);',
        'if (aChunks != null) this.add(aChunks);\n    return module.observe(this);');
    }
    const isolated = new Module(sourcePath, module);
    isolated.filename = sourcePath;
    isolated.paths = Module._nodeModulePaths(path.dirname(sourcePath));
    isolated.observe = observe;
    isolated._compile(source, sourcePath);
    SourceNode = isolated.exports.SourceNode;
  }

  function expand(code, consumer, relativePath) {
    if (mode === 'stream') throw new Error('Streaming has no expanded tree');
    return SourceNode.fromStringWithSourceMap(code, consumer, relativePath);
  }

  function serialize(tree) {
    return new SourceNode(null, null, null, [PREFIX, tree, SUFFIX])
      .toStringWithSourceMap({ file: 'wrapped.js' });
  }

  function render(code, consumer, relativePath) {
    if (mode !== 'stream') return serialize(expand(code, consumer, relativePath));
    const walker = {
      walk(callback) {
        callback(PREFIX, LOCATION);
        const sink = {
          add(chunk) {
            if (typeof chunk === 'string') {
              if (chunk !== '') callback(chunk, LOCATION);
            } else {
              chunk.walk(callback);
            }
            return this;
          },
          setSourceContent() {},
        };
        SourceNode.fromStringWithSourceMap(code, consumer, relativePath, sink);
        callback(SUFFIX, LOCATION);
      },
      walkSourceContents(callback) {
        for (let source of consumer.sources) {
          const content = consumer.sourceContentFor(source);
          if (content !== null) {
            if (relativePath != null) source = util.join(relativePath, source);
            callback(source, content);
          }
        }
      },
    };
    return SourceNode.prototype.toStringWithSourceMap.call(walker, { file: 'wrapped.js' });
  }

  return { SourceNode, expand, serialize, render };
}

/** Generate valid maps with names, duplicate positions, unmapped spans and CRLF. */
function makeFixture(count, { crlf = false, sourceRoot, unmapped = true } = {}) {
  const generator = new sourceMap.SourceMapGenerator({ file: 'input.js', sourceRoot });
  const newline = crlf ? '\r\n' : '\n';
  const lines = [];
  for (let i = 0; i < count; i++) {
    const line = Math.floor(i / 8) + 1;
    if (!lines[line - 1]) lines[line - 1] = '';
    const column = lines[line - 1].length;
    const mapping = { generated: { line, column } };
    if (!unmapped || i % 7 !== 0) {
      mapping.source = `module-${i % 3}.js`;
      mapping.original = { line: i % 50 + 1, column: i % 9 };
      if (i % 2 === 0) mapping.name = `name${i % 5}`;
    }
    generator.addMapping(mapping);
    if (i % 11 === 0) generator.addMapping({ ...mapping });
    lines[line - 1] += `x=${i}; `;
  }
  for (let source = 0; source < 3; source++) {
    generator.setSourceContent(`module-${source}.js`,
      Array.from({ length: 50 }, (_, line) => `// ${source}:${line}`).join('\n'));
  }
  return { code: lines.join(newline) + (count ? newline + '// unmapped tail' : ''), map: generator.toJSON() };
}

module.exports = { createVariant, makeFixture, sourceMap };
