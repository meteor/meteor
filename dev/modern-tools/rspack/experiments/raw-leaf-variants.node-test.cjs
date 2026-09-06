const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createRawVariant, helperPath } = require('./raw-leaf-variants.cjs');
const { makeFixture, sourceMap } = require('./source-node-variants.cjs');

async function render(mode, fixture) {
  const variant = createRawVariant(mode);
  const consumer = await new sourceMap.SourceMapConsumer(fixture.map);
  try {
    const tree = variant.expand(fixture.code, consumer);
    const output = variant.serialize(tree);
    const repeated = variant.serialize(tree);
    assert.equal(repeated.code, output.code);
    assert.equal(repeated.map.toString(), output.map.toString());
    return { tree, code: output.code, map: output.map.toString() };
  } finally {
    consumer.destroy();
  }
}

test('raw layouts preserve class code/maps across procedural cases', async () => {
  for (const count of [0, 1, 17, 101]) {
    for (const crlf of [false, true]) {
      for (const unmapped of [false, true]) {
        const fixture = makeFixture(count, { crlf, unmapped, sourceRoot: '/source' });
        const baseline = await render('raw-class', fixture);
        for (const mode of ['raw-own', 'raw-prototype']) {
          const actual = await render(mode, fixture);
          assert.equal(actual.code, baseline.code);
          assert.equal(actual.map, baseline.map);
          assert.equal(actual.tree.children.length, baseline.tree.children.length);
        }
      }
    }
  }
});

test('raw factories share methods without per-instance closures and preserve field layout', async () => {
  for (const mode of ['raw-class', 'raw-own', 'raw-prototype']) {
    const { tree } = await render(mode, makeFixture(100));
    const leaves = tree.children.filter(child => typeof child !== 'string');
    assert.ok(leaves.length > 1);
    assert.deepEqual(Object.keys(leaves[0]).slice(0, 5), ['line', 'column', 'source', 'name', 'code']);
    for (const leaf of leaves) {
      assert.equal(leaf.walk, leaves[0].walk);
      assert.equal(leaf.walkSourceContents, leaves[0].walkSourceContents);
      assert.equal(leaf['$$$isSourceNode$$$'], true);
      assert.equal(Object.keys(leaf).length, mode === 'raw-own' ? 8 : 5);
      assert.equal(Object.hasOwn(leaf, 'children'), false);
      assert.equal(Object.hasOwn(leaf, 'sourceContents'), false);
    }
  }
});

test('preload selects only the requested helper and emits interception evidence', () => {
  for (const mode of ['raw-class', 'raw-own', 'raw-prototype']) {
    const result = spawnSync(process.execPath, ['--require', require.resolve('./raw-leaf-preload.cjs'),
      '-e', `const helper = require(${JSON.stringify(helperPath)}); if (typeof helper.fromStringWithSourceMap !== 'function') process.exit(2);`], {
      env: { ...process.env, METEOR_RAW_LEAF_VARIANT: mode }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, new RegExp(`"mode":"${mode}"`));
    assert.equal(result.stderr.split('[raw-leaf-experiment]').length - 1, 1);
  }
});

test('unknown raw layout is rejected', () => {
  assert.throws(() => createRawVariant('typo'), /Unknown raw leaf/);
});
