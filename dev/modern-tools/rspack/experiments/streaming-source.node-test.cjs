const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadStreaming } = require('./streaming-loader.cjs');
const { sourceMap, makeFixture } = require('./source-node-variants.cjs');
const { StreamingMappedSource, serializeStreamingSource } = loadStreaming();

const { SourceNode, SourceMapConsumer } = sourceMap;

function wrapped(...children) {
  return new SourceNode(null, null, null, ['header\n', ...children, '\nfooter']);
}

function bytes(output) {
  return { code: output.code, map: output.map.toString() };
}

async function ordinary(fixture) {
  const consumer = await new SourceMapConsumer(fixture.map);
  try {
    return SourceNode.fromStringWithSourceMap(fixture.code, consumer);
  } finally {
    consumer.destroy();
  }
}

function trackedConsumers({ failAt = Infinity } = {}) {
  const records = [];
  let attempts = 0;
  const failure = new Error('consumer preparation failed');
  return {
    records,
    failure,
    dependencies: {
      async createConsumer(map) {
        if (++attempts === failAt) throw failure;
        const consumer = await new SourceMapConsumer(map);
        const record = { destroyed: 0, walks: 0 };
        records.push(record);
        const assertAlive = () => assert.equal(record.destroyed, 0, 'consumer used after destroy');
        return {
          get sources() { assertAlive(); return consumer.sources; },
          eachMapping(callback, ...args) {
            assertAlive();
            record.walks++;
            return consumer.eachMapping(callback, ...args);
          },
          sourceContentFor(...args) {
            assertAlive();
            return consumer.sourceContentFor(...args);
          },
          destroy() {
            assertAlive();
            record.destroyed++;
            consumer.destroy();
          },
        };
      },
    },
  };
}

test('streaming preserves procedural source and map bytes', async () => {
  for (const count of [0, 1, 17, 101]) {
    for (const crlf of [false, true]) {
      for (const unmapped of [false, true]) {
        const fixture = makeFixture(count, { crlf, unmapped, sourceRoot: '/sources' });
        const baseline = wrapped(await ordinary(fixture));
        const stream = wrapped(new StreamingMappedSource(fixture.code, fixture.map));
        for (const options of [{}, { file: 'app.js' }]) {
          assert.deepEqual(bytes(await serializeStreamingSource(stream, options)),
            bytes(baseline.toStringWithSourceMap(options)));
        }
      }
    }
  }
});

test('repeated and concurrent serializations use fresh consumers without mutating cached nodes', async () => {
  const fixture = makeFixture(40);
  const node = new StreamingMappedSource(fixture.code, fixture.map);
  const keysBefore = Reflect.ownKeys(node);
  const root = wrapped(node);
  const tracked = trackedConsumers();
  const expected = bytes(wrapped(await ordinary(fixture)).toStringWithSourceMap({}));
  const first = await serializeStreamingSource(root, {}, tracked.dependencies);
  const concurrent = await Promise.all([
    serializeStreamingSource(root, {}, tracked.dependencies),
    serializeStreamingSource(root, {}, tracked.dependencies),
  ]);
  for (const output of [first, ...concurrent]) assert.deepEqual(bytes(output), expected);
  assert.equal(tracked.records.length, 3);
  assert.ok(tracked.records.every(record => record.destroyed === 1));
  assert.deepEqual(Reflect.ownKeys(node), keysBefore);
});

test('multiple streamed nodes and repeated identity preserve order and share only within an invocation', async () => {
  const first = makeFixture(17);
  const second = makeFixture(33, { crlf: true });
  const node = new StreamingMappedSource(first.code, first.map);
  const other = new StreamingMappedSource(second.code, JSON.stringify(second.map));
  const root = wrapped(node, '\nseparator\n', other, '\nrepeat\n', node);
  const expected = wrapped(await ordinary(first), '\nseparator\n', await ordinary(second),
    '\nrepeat\n', await ordinary(first)).toStringWithSourceMap({ file: 'joined.js' });
  const tracked = trackedConsumers();
  const output = await serializeStreamingSource(root, { file: 'joined.js' }, tracked.dependencies);
  assert.deepEqual(bytes(output), bytes(expected));
  assert.equal(tracked.records.length, 2);
  assert.ok(tracked.records.every(record => record.destroyed === 1));
  assert.deepEqual(tracked.records.map(record => record.walks).sort(), [1, 2]);
});

test('preparation failure after a successful consumer destroys created consumers', async () => {
  const fixture = makeFixture(10);
  const tracked = trackedConsumers({ failAt: 2 });
  await assert.rejects(serializeStreamingSource(wrapped(
    new StreamingMappedSource(fixture.code, fixture.map),
    new StreamingMappedSource(fixture.code, fixture.map),
  ), {}, tracked.dependencies), error => error === tracked.failure);
  assert.equal(tracked.records.length, 1);
  assert.equal(tracked.records[0].destroyed, 1);
});

test('serialization failure destroys consumers and preserves the error', async () => {
  const fixture = makeFixture(10);
  const failure = new Error('serialization callback failed');
  const tracked = trackedConsumers();
  const createConsumer = tracked.dependencies.createConsumer;
  tracked.dependencies.createConsumer = async map => {
    const consumer = await createConsumer(map);
    const eachMapping = consumer.eachMapping.bind(consumer);
    consumer.eachMapping = callback => eachMapping(mapping => {
      callback(mapping);
      throw failure;
    });
    return consumer;
  };
  await assert.rejects(serializeStreamingSource(wrapped(
    new StreamingMappedSource(fixture.code, fixture.map),
    new StreamingMappedSource(fixture.code, fixture.map),
  ), {}, tracked.dependencies), error => error === failure);
  assert.ok(tracked.records.length > 0);
  assert.ok(tracked.records.every(record => record.destroyed === 1));
});

test('ordinary-only trees retain normal serialization', async () => {
  const root = wrapped('plain code');
  const tracked = trackedConsumers();
  assert.deepEqual(bytes(await serializeStreamingSource(root, {}, tracked.dependencies)),
    bytes(root.toStringWithSourceMap({})));
  assert.equal(tracked.records.length, 0);
});

test('indexed maps preserve section offsets and contents', async () => {
  const first = makeFixture(8, { unmapped: false });
  const second = makeFixture(17, { unmapped: false });
  const fixture = {
    code: first.code + '\n' + second.code,
    map: {
      version: 3,
      sections: [
        { offset: { line: 0, column: 0 }, map: first.map },
        { offset: { line: first.code.split('\n').length, column: 0 }, map: second.map },
      ],
    },
  };
  const expected = wrapped(await ordinary(fixture)).toStringWithSourceMap({});
  assert.deepEqual(bytes(await serializeStreamingSource(wrapped(
    new StreamingMappedSource(fixture.code, fixture.map),
  ))), bytes(expected));
});

test('streaming nodes reject ordinary synchronous traversal', () => {
  const fixture = makeFixture(1);
  const node = new StreamingMappedSource(fixture.code, fixture.map);
  assert.throws(() => node.walk(() => {}));
  assert.throws(() => node.walkSourceContents(() => {}));
});

test('experimental preload adapts linker and HMR boundaries through Meteor TypeScript loading', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../../../..');
  for (const mode of ['class', 'stream']) {
    const child = spawnSync(process.execPath, ['--require', path.join(__dirname, 'streaming-preload.cjs'),
      '-e', 'require("./tools/tool-env/install-babel"); require("./tools/isobuild/linker.js"); require("./tools/runners/run-hmr.js");'], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: '', METEOR_STREAMING_VARIANT: mode,
        NODE_PATH: path.join(root, 'dev_bundle/lib/node_modules') },
      encoding: 'utf8',
    });
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stderr, new RegExp(`"mode":"${mode}"`));
    assert.match(child.stderr, /tools\/isobuild\/linker.js/);
    assert.match(child.stderr, /tools\/runners\/run-hmr.js/);
  }
});

test('streaming preserves Unicode columns, missing contents and distinct duplicate positions', async () => {
  const generator = new sourceMap.SourceMapGenerator({ file: 'unicode.js' });
  const chunks = ['"😀";', '"漢字";'];
  let column = 0;
  for (const chunk of chunks) {
    for (const line of [1, 2]) {
      generator.addMapping({ generated: { line: 1, column },
        original: { line, column: 0 }, source: 'unicode-source.js' });
    }
    column += chunk.length;
  }
  const fixture = { code: chunks.join(''), map: generator.toJSON() };
  const normal = wrapped(await ordinary(fixture));
  const stream = wrapped(new StreamingMappedSource(fixture.code, fixture.map));
  assert.deepEqual(bytes(await serializeStreamingSource(stream)), bytes(normal.toStringWithSourceMap()));
});

test('source-content traversal preserves child order and root overrides', async () => {
  const first = makeFixture(17);
  const second = makeFixture(17);
  second.map.sourcesContent = second.map.sourcesContent.map(() => 'second content');
  const normal = wrapped(await ordinary(first), await ordinary(second));
  const stream = wrapped(new StreamingMappedSource(first.code, first.map), new StreamingMappedSource(second.code, second.map));
  normal.setSourceContent('module-0.js', 'root content');
  stream.setSourceContent('module-0.js', 'root content');
  assert.deepEqual(bytes(await serializeStreamingSource(stream)), bytes(normal.toStringWithSourceMap()));
});
