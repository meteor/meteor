const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { makeFixture, sourceMap } = require('./source-node-variants.cjs');
const { createRawVariant } = require('./raw-leaf-variants.cjs');
const { loadStreaming } = require('./streaming-loader.cjs');
const { StreamingMappedSource, serializeStreamingSource, shouldStreamMappedSource } = loadStreaming();
const [directory, mode] = process.argv.slice(2);
if (!directory || !['class', 'stream', 'hybrid'].includes(mode) || !global.gc) {
  throw new Error('Use node --expose-gc measure-hybrid-reuse.cjs OUTPUT class|stream|hybrid');
}
const SMALL_INPUTS = 40;
const SMALL_SEGMENTS = 500;
const LARGE_SEGMENTS = 140000;
const SERIALIZATIONS = 4;
fs.mkdirSync(directory);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function collect() {
  for (let i = 0; i < 3; i++) { await nextTurn(); global.gc(); }
  await nextTurn();
}
(async () => {
  const compact = createRawVariant('raw-class');
  let inputs = Array.from({ length: SMALL_INPUTS + 1 }, (_, index) =>
    makeFixture(index === 0 ? LARGE_SEGMENTS : SMALL_SEGMENTS, { sourceRoot: `/input-${index}` }));
  const inputInfo = inputs.map(input => ({ codeUnits: input.code.length,
    codeSha256: hash(input.code), mapSha256: hash(JSON.stringify(input.map)) }));
  await collect();
  const setupStart = performance.now(); const setupCpu = process.cpuUsage();
  let chunks = [];
  const selection = { compact: 0, stream: 0 };
  for (const input of inputs) {
    if (shouldStreamMappedSource(mode, input.code.length)) {
      selection.stream++;
      chunks.push(new StreamingMappedSource(input.code, input.map));
    } else {
      selection.compact++;
      const consumer = await new sourceMap.SourceMapConsumer(input.map);
      try { chunks.push(compact.expand(input.code, consumer)); } finally { consumer.destroy(); }
    }
    chunks.push('\n');
  }
  let root = new sourceMap.SourceNode(null, null, null, chunks);
  chunks = null; inputs = null;
  const setup = { durationMs: performance.now() - setupStart, cpuMicros: process.cpuUsage(setupCpu) };
  await collect();
  const holderMemory = process.memoryUsage();
  const serializations = [];
  let outputInfo;
  for (let iteration = 0; iteration < SERIALIZATIONS; iteration++) {
    const start = performance.now(); const cpu = process.cpuUsage();
    let output = await serializeStreamingSource(root, { file: 'mixed.js' });
    const row = { iteration, durationMs: performance.now() - start, cpuMicros: process.cpuUsage(cpu) };
    let map = output.map.toString();
    const info = { codeSha256: hash(output.code), mapSha256: hash(map) };
    if (outputInfo && JSON.stringify(outputInfo) !== JSON.stringify(info)) throw new Error('Reuse changed output');
    outputInfo = info;
    if (iteration === 0) {
      fs.writeFileSync(path.join(directory, 'mixed.js'), output.code);
      fs.writeFileSync(path.join(directory, 'mixed.js.map'), map);
    }
    output = null; map = null;
    await collect();
    serializations.push(row);
  }
  root = null;
  await collect();
  const result = { mode, node: process.version, inputInfo, selection, setup, holderMemory,
    serializations, output: outputInfo, releasedMemory: process.memoryUsage(),
    maxRssKiB: process.resourceUsage().maxRSS,
    note: 'Procedural mixed-input reuse, forced GC between serializations; timings exclude map.toString and I/O. Not a development rebuild benchmark.' };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ mode, selection }));
})().catch(error => { console.error(error); process.exitCode = 1; });
