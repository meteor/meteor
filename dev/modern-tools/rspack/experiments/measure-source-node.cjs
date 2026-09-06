const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const v8 = require('node:v8');
const { performance } = require('node:perf_hooks');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { createVariant, makeFixture, sourceMap } = require('./source-node-variants.cjs');

const [outputDirectory, mode, codePath, mapPath] = process.argv.slice(2);
if (!outputDirectory || !mode || typeof global.gc !== 'function') {
  throw new Error('Use node --expose-gc measure-source-node.cjs OUTPUT MODE [CODE MAP]');
}
if (process.env.SOURCE_NODE_SNAPSHOT === '1' && codePath) {
  throw new Error('Heap snapshots are restricted to the small procedural fixture');
}
fs.mkdirSync(outputDirectory, { recursive: false });
const stages = [];
const accesses = {};
let phase = 'initialization';
const observe = target => {
  accesses.nodes = (accesses.nodes || 0) + 1;
  return new Proxy(target, {
    get(object, key, receiver) {
      const label = `${phase}:get:${String(key)}`;
      accesses[label] = (accesses[label] || 0) + 1;
      return Reflect.get(object, key, receiver);
    },
    set(object, key, value, receiver) {
      const label = `${phase}:set:${String(key)}`;
      accesses[label] = (accesses[label] || 0) + 1;
      return Reflect.set(object, key, value, receiver);
    },
  });
};

function sample(stage, extra = {}) {
  const entry = { stage, ...extra, memory: process.memoryUsage(),
    uptimeSeconds: process.uptime(), maxRssKiB: process.resourceUsage().maxRSS };
  stages.push(entry);
  fs.appendFileSync(path.join(outputDirectory, 'stages.jsonl'), JSON.stringify(entry) + '\n');
}

/** End the current job before each GC so WeakRef keep-alive rules do not pin it. */
async function collect() {
  for (let attempt = 0; attempt < 3; attempt++) {
    await nextTurn();
    global.gc();
  }
  await nextTurn();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

(async () => {
  const variant = createVariant(mode, observe);
  let input = codePath
    ? { code: fs.readFileSync(codePath, 'utf8'), map: JSON.parse(fs.readFileSync(mapPath, 'utf8')) }
    : makeFixture(10000);
  const inputInfo = { codeUnits: input.code.length, codeSha256: sha256(input.code),
    mapSha256: sha256(JSON.stringify(input.map)), sources: input.map.sources.length,
    names: input.map.names.length, mappingsCodeUnits: input.map.mappings.length };
  await collect();
  sample('inputs-held');
  let consumer = await new sourceMap.SourceMapConsumer(input.map);
  const consumerWeak = new WeakRef(consumer);
  await collect();
  sample('consumer-ready');

  let tree;
  let treeWeak;
  let output;
  if (mode !== 'stream') {
    phase = 'expand';
    const expansionCpu = process.cpuUsage();
    const started = performance.now();
    tree = variant.expand(input.code, consumer);
    sample('expanded-before-gc', { durationMs: performance.now() - started,
      cpuMicros: process.cpuUsage(expansionCpu), rootChildren: tree.children.length });
    treeWeak = new WeakRef(tree);
    globalThis.__sourceNodeHypothesisRoot = tree;
    await collect();
    sample('tree-held-after-gc');
    consumer.destroy();
    consumer = null;
    input = null;
    await collect();
    sample('consumer-released-tree-held', { consumerCollected: consumerWeak.deref() === undefined });
    if (process.env.SOURCE_NODE_SNAPSHOT === '1') {
      v8.writeHeapSnapshot(path.join(outputDirectory, 'tree.heapsnapshot'));
    }
    phase = 'serialize';
    const serializationCpu = process.cpuUsage();
    const serializationStarted = performance.now();
    output = variant.serialize(tree);
    sample('output-with-tree-before-gc', { durationMs: performance.now() - serializationStarted,
      cpuMicros: process.cpuUsage(serializationCpu) });
    tree = null;
    globalThis.__sourceNodeHypothesisRoot = null;
  } else {
    phase = 'stream';
    const started = performance.now();
    output = variant.render(input.code, consumer);
    sample('stream-output-before-gc', { durationMs: performance.now() - started });
    consumer.destroy();
    consumer = null;
    input = null;
  }

  await collect();
  sample('output-held-tree-released', { treeCollected: treeWeak ? treeWeak.deref() === undefined : null,
    consumerCollected: consumerWeak.deref() === undefined });
  phase = 'write';
  let serializedMap = output.map.toString();
  const outputInfo = { codeBytes: Buffer.byteLength(output.code), codeSha256: sha256(output.code),
    mapBytes: Buffer.byteLength(serializedMap), mapSha256: sha256(serializedMap) };
  fs.writeFileSync(path.join(outputDirectory, 'wrapped.js'), output.code);
  fs.writeFileSync(path.join(outputDirectory, 'wrapped.js.map'), serializedMap);
  const generatorWeak = new WeakRef(output.map);
  output = null;
  await collect();
  sample('serialized-map-held', { generatorCollected: generatorWeak.deref() === undefined });
  serializedMap = null;
  await collect();
  sample('all-output-released', { treeCollected: treeWeak ? treeWeak.deref() === undefined : null,
    consumerCollected: consumerWeak.deref() === undefined,
    generatorCollected: generatorWeak.deref() === undefined });

  const result = { mode, node: process.version, input: inputInfo, output: outputInfo, stages,
    variant: variant.metadata || null,
    proxyAccesses: mode === 'proxy' ? accesses : null,
    snapshot: process.env.SOURCE_NODE_SNAPSHOT === '1',
    note: 'Isolated forced-GC diagnostics; not build timings or a general SourceNode replacement.' };
  fs.writeFileSync(path.join(outputDirectory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ mode, ...outputInfo, peakRssMiB: process.resourceUsage().maxRSS / 1024 }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
