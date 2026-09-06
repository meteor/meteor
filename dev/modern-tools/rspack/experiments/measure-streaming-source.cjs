const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { sourceMap } = require('./source-node-variants.cjs');
const { createRawVariant } = require('./raw-leaf-variants.cjs');
const { loadStreaming } = require('./streaming-loader.cjs');
const { StreamingMappedSource, serializeStreamingSource } = loadStreaming();
const [directory, mode, codePath, mapPath] = process.argv.slice(2);
if (!directory || !['class', 'stream'].includes(mode) || !mapPath || !global.gc) {
  throw new Error('Use node --expose-gc measure-streaming-source.cjs OUTPUT class|stream CODE MAP');
}
fs.mkdirSync(directory);
const stages = [];
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
async function collect() {
  for (let i = 0; i < 3; i++) { await nextTurn(); global.gc(); }
  await nextTurn();
}
function sample(stage, extra = {}) {
  const row = { stage, ...extra, memory: process.memoryUsage(), maxRssKiB: process.resourceUsage().maxRSS };
  stages.push(row);
  fs.appendFileSync(path.join(directory, 'stages.jsonl'), JSON.stringify(row) + '\n');
}
(async () => {
  const compact = createRawVariant('raw-class');
  let input = { code: fs.readFileSync(codePath, 'utf8'), map: JSON.parse(fs.readFileSync(mapPath, 'utf8')) };
  const inputInfo = { codeSha256: sha256(input.code), mapSha256: sha256(JSON.stringify(input.map)) };
  await collect(); sample('input-held');
  let cpu = process.cpuUsage(); let start = performance.now();
  let chunk;
  if (mode === 'stream') {
    chunk = new StreamingMappedSource(input.code, input.map);
  } else {
    let consumer = await new sourceMap.SourceMapConsumer(input.map);
    try { chunk = compact.expand(input.code, consumer); } finally { consumer.destroy(); }
    consumer = null;
  }
  let root = new sourceMap.SourceNode(null, null, null, ['(function(){\n', chunk, '\n})();\n']);
  const weakRoot = new WeakRef(root);
  chunk = null; input = null;
  sample('constructed', { durationMs: performance.now() - start, cpuMicros: process.cpuUsage(cpu) });
  await collect(); sample('holder-after-gc');
  cpu = process.cpuUsage(); start = performance.now();
  let output = await serializeStreamingSource(root, { file: 'wrapped.js' });
  sample('serialized', { durationMs: performance.now() - start, cpuMicros: process.cpuUsage(cpu) });
  root = null;
  await collect(); sample('output-after-gc', { rootCollected: weakRoot.deref() === undefined });
  let map = output.map.toString();
  const outputInfo = { codeSha256: sha256(output.code), mapSha256: sha256(map),
    codeBytes: Buffer.byteLength(output.code), mapBytes: Buffer.byteLength(map) };
  fs.writeFileSync(path.join(directory, 'wrapped.js'), output.code);
  fs.writeFileSync(path.join(directory, 'wrapped.js.map'), map);
  output = null; map = null;
  await collect(); sample('released');
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ mode,
    node: process.version, input: inputInfo, output: outputInfo, stages,
    note: 'Fresh-process forced-GC experiment with TypeScript loader present in both controls; stage CPU is process-wide.' }, null, 2) + '\n');
  console.log(JSON.stringify({ mode, ...outputInfo }));
})().catch(error => { console.error(error); process.exitCode = 1; });
