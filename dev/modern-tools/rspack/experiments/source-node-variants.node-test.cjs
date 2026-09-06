const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVariant, makeFixture, sourceMap } = require('./source-node-variants.cjs');

async function render(mode, fixture, relativePath, observe) {
  const variant = createVariant(mode, observe);
  const consumer = await new sourceMap.SourceMapConsumer(fixture.map);
  try {
    const output = variant.render(fixture.code, consumer, relativePath);
    return { code: output.code, map: output.map.toString() };
  } finally {
    consumer.destroy();
  }
}

test('representations preserve bytes and normalized maps across procedural edge cases', async () => {
  for (const count of [0, 1, 17, 101]) {
    for (const crlf of [false, true]) {
      const fixture = makeFixture(count, { crlf, sourceRoot: '/sources', unmapped: false });
      for (const relativePath of [undefined, '../joined']) {
        const baseline = await render('baseline', fixture, relativePath);
        for (const mode of ['lazy-metadata', 'compact', 'stream']) {
          assert.deepEqual(await render(mode, fixture, relativePath), baseline,
            `${mode} / ${count} / CRLF=${crlf} / ${relativePath}`);
        }
      }
    }
  }
});

test('unmapped spans preserve output and the baseline relative-path error', async () => {
  const fixture = makeFixture(101, { crlf: true });
  const baseline = await render('baseline', fixture);
  for (const mode of ['baseline', 'lazy-metadata', 'compact', 'stream']) {
    assert.deepEqual(await render(mode, fixture), baseline);
    // The installed library attempts util.join(relativePath, null) for an
    // unmapped segment. Preserve this observed failure rather than conceal it.
    await assert.rejects(render(mode, fixture, '../joined'), TypeError);
  }
});

test('distinct mappings at repeated coordinates and empty trailing spans preserve bytes', async () => {
  const generator = new sourceMap.SourceMapGenerator({ file: 'input.js' });
  for (const column of [0, 4]) {
    for (const line of [1, 2]) {
      generator.addMapping({ generated: { line: 1, column },
        original: { line, column: 0 }, source: 'original.js' });
    }
  }
  generator.setSourceContent('original.js', 'first\nsecond');
  const fixture = { code: 'x=1;', map: generator.toJSON() };
  const consumer = await new sourceMap.SourceMapConsumer(fixture.map);
  let count = 0;
  try {
    consumer.eachMapping(() => count++);
  } finally {
    consumer.destroy();
  }
  assert.equal(count, 4, 'distinct mappings must survive generator deduplication');
  const baseline = await render('baseline', fixture);
  for (const mode of ['lazy-metadata', 'compact', 'stream', 'proxy']) {
    assert.deepEqual(await render(mode, fixture), baseline);
  }
});

test('compact leaves omit per-leaf children and metadata containers', async () => {
  const fixture = makeFixture(40);
  const consumer = await new sourceMap.SourceMapConsumer(fixture.map);
  try {
    const tree = createVariant('compact').expand(fixture.code, consumer);
    const leaves = tree.children.filter(child => typeof child !== 'string');
    assert.ok(leaves.length > 0);
    assert.ok(leaves.every(leaf => !Object.hasOwn(leaf, 'children')));
    assert.ok(leaves.every(leaf => !Object.hasOwn(leaf, 'sourceContents')));
    assert.ok(Object.keys(tree.sourceContents).length > 0);
  } finally {
    consumer.destroy();
  }
});

test('lazy metadata remains separate when individual nodes receive source content', () => {
  const { SourceNode } = createVariant('lazy-metadata');
  const first = new SourceNode();
  const second = new SourceNode();
  assert.equal(first.sourceContents, second.sourceContents);
  first.setSourceContent('first.js', 'first');
  second.setSourceContent('second.js', 'second');
  assert.deepEqual(first.sourceContents, { 'first.js': 'first' });
  assert.deepEqual(second.sourceContents, { 'second.js': 'second' });
});

test('proxy access observation preserves output and reports aggregate field accesses', async () => {
  const fixture = makeFixture(80);
  const accesses = { get: {}, set: {}, nodes: 0 };
  const observe = target => {
    accesses.nodes++;
    return new Proxy(target, {
      get(object, key, receiver) {
        accesses.get[String(key)] = (accesses.get[String(key)] || 0) + 1;
        return Reflect.get(object, key, receiver);
      },
      set(object, key, value, receiver) {
        accesses.set[String(key)] = (accesses.set[String(key)] || 0) + 1;
        return Reflect.set(object, key, value, receiver);
      },
    });
  };
  assert.deepEqual(await render('proxy', fixture, undefined, observe),
    await render('baseline', fixture));
  assert.ok(accesses.nodes > 1);
  assert.ok(accesses.get.children > 0);
  assert.ok(accesses.get.sourceContents > 0);
  assert.equal(accesses.get.join, undefined);
});
