const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryTrace } = require('./linker-memory-trace.js');

test('disabled tracing neither samples memory nor inspects input', context => {
  context.mock.method(process, 'memoryUsage', () => assert.fail('unexpected sample'));
  const trace = createMemoryTrace(false, () => assert.fail('unexpected output'));
  trace('request', null, null);
});

test('tracing filters small files and emits primitive metadata for large files', () => {
  const lines = [];
  const trace = createMemoryTrace(true, line => lines.push(line));
  const file = {
    source: 'x'.repeat(1024 * 1024),
    sourceMap: { mustNotBeSerialized: true },
    sourcePath: 'generated.js',
    bundleArch: 'web.browser',
  };

  trace('request', { ...file, source: 'small' }, { size: 0 });
  assert.equal(lines.length, 0);
  trace('request', file, { size: 2 });
  trace('compute', file, { size: 3 });

  const events = lines.map(line => JSON.parse(line.slice('[linker-memory] '.length)));
  assert.deepEqual(events.map(event => event.event), ['request', 'compute']);
  assert.deepEqual(events.map(event => event.cacheEntries), [2, 3]);
  assert.equal(events[0].codeUnits, file.source.length);
  assert.equal(events[0].arch, file.bundleArch);
  assert.equal(events[0].sourcePath, file.sourcePath);
  assert.equal(events[0].hasMap, true);
  assert.ok(events[0].memory.heapUsed > 0);
  assert.ok(events[1].uptimeSeconds >= events[0].uptimeSeconds);
  assert.ok(lines.every(line => line.length < 1024));
  assert.ok(lines.every(line => !line.includes('mustNotBeSerialized')));
});
