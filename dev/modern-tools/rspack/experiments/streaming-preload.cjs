const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mode = process.env.METEOR_STREAMING_VARIANT;
if (!['class', 'stream'].includes(mode)) throw new Error('Set METEOR_STREAMING_VARIANT=class or stream');
const root = path.resolve(__dirname, '../../../..');
const linkerPath = path.join(root, 'tools/isobuild/linker.js');
const hmrPath = path.join(root, 'tools/runners/run-hmr.js');
const originalRead = fs.readFileSync;
const reported = new Set();
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const helperSha256 = hash(originalRead(path.join(root, 'tools/isobuild/experiments/streaming-source-node.ts')));

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Streaming integration source changed: ' + before);
  return source.replace(before, after);
}

function transform(source, filename) {
  const helper = filename === linkerPath ? './experiments/streaming-source-node.ts' : '../isobuild/experiments/streaming-source-node.ts';
  source = `
const streamingExperiment = require(${JSON.stringify(helper)});
const STREAM_TRACE_CODE_UNITS = 1 << 20;
async function serializeStreamingSource(root, options) {
  const started = performance.now();
  const cpu = process.cpuUsage();
  const before = process.memoryUsage();
  const output = await streamingExperiment.serializeStreamingSource(root, options);
  if (output.code.length >= STREAM_TRACE_CODE_UNITS) {
    process.stderr.write('[stream-serialization] ' + JSON.stringify({
      mode: ${JSON.stringify(mode)}, codeUnits: output.code.length,
      durationMs: performance.now() - started, cpuMicros: process.cpuUsage(cpu),
      before, after: process.memoryUsage()
    }) + '\\n');
  }
  return output;
}
` + source;
  if (filename === hmrPath) {
    return replaceOnce(source, 'content: content.toStringWithSourceMap({}),',
      'content: await serializeStreamingSource(content, {}),');
  }
  source = replaceOnce(source, 'return node.toStringWithSourceMap({', 'return serializeStreamingSource(node, {');
  source = replaceOnce(source, 'var swsm = node.toStringWithSourceMap({', 'var swsm = await serializeStreamingSource(node, {');
  source = replaceOnce(source, 'function () {\n        if (fileCount > 0)', 'async function () {\n        if (fileCount > 0)');
  source = replaceOnce(source, 'const result = linkedOutput.toStringWithSourceMap({', 'const result = await serializeStreamingSource(linkedOutput, {');
  source = replaceOnce(source, 'result.source = node.toString();', 'result.source = (await serializeStreamingSource(node)).code;');
  if (mode === 'stream') {
    const original = `        traceMemory('consumer-start', file, getPrelinkedOutputCached);
        const sourcemapConsumer = await new sourcemap.SourceMapConsumer(result.map);
        try {
          traceMemory('expand-start', file, getPrelinkedOutputCached);
          chunk = fromStringWithSourceMap(result.code, sourcemapConsumer);
          traceMemory('expand-end', file, getPrelinkedOutputCached);
        } finally {
          sourcemapConsumer.destroy();
        }`;
    source = replaceOnce(source, original,
      `        traceMemory('stream-input', file, getPrelinkedOutputCached);
        chunk = new streamingExperiment.StreamingMappedSource(result.code, result.map);`);
  }
  return source;
}

// Experiment-only source view for Babel's reader. Restrict interception to two
// known files, preserve string/Buffer return type, and let Babel hash the altered
// text normally. The checkout and installed dependencies remain untouched.
fs.readFileSync = function(filename, ...args) {
  const value = originalRead.call(this, filename, ...args);
  const resolved = typeof filename === 'string' ? path.resolve(filename) : null;
  if (resolved !== linkerPath && resolved !== hmrPath) return value;
  const original = value.toString();
  const transformed = transform(original, resolved);
  if (!reported.has(resolved)) {
    reported.add(resolved);
    process.stderr.write('[streaming-experiment] ' + JSON.stringify({ mode,
      file: path.relative(root, resolved), originalSha256: hash(original),
      transformedSha256: hash(transformed), helperSha256 }) + '\n');
  }
  return Buffer.isBuffer(value) ? Buffer.from(transformed) : transformed;
};
