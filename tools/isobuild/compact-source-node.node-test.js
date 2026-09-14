require('../tool-env/install-babel.js');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SourceNode, SourceMapConsumer, SourceMapGenerator } = require('source-map');
const { fromStringWithSourceMap } = require('./compact-source-node');


function makeFixture(count, { crlf = false, sourceRoot, unmapped = true } = {}) {
  const generator = new SourceMapGenerator({ file: 'input.js', sourceRoot });
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

async function compare(fixture) {
  const consumer = await new SourceMapConsumer(fixture.map);
  try {
    const baseline = SourceNode.fromStringWithSourceMap(fixture.code, consumer);
    const compact = fromStringWithSourceMap(fixture.code, consumer);
    assert.ok(compact instanceof SourceNode);
    assert.equal(compact.toString(), baseline.toString());
    assert.deepEqual(compact.sourceContents, baseline.sourceContents);

    // Cached trees are reused inside different module, dynamic-import and HMR
    // wrappers. Serialization must neither consume nor mutate their leaves.
    for (const options of [{}, { file: 'app.js' }, { file: 'dynamic/module.js' }]) {
      for (const tree of [compact, baseline]) {
        const wrapped = new SourceNode(null, null, null, ['header\n',
          new SourceNode(null, null, null, ['(', tree, ')']), '\nfooter']);
        const output = wrapped.toStringWithSourceMap(options);
        const expected = new SourceNode(null, null, null, ['header\n',
          new SourceNode(null, null, null, ['(', baseline, ')']), '\nfooter'])
          .toStringWithSourceMap(options);
        assert.equal(output.code, expected.code);
        assert.equal(output.map.toString(), expected.map.toString());
      }
    }
    return compact;
  } finally {
    consumer.destroy();
  }
}

test('compact prelink trees preserve procedural map bytes and repeated composition', async () => {
  for (const count of [0, 1, 17, 101, 1000]) {
    for (const crlf of [false, true]) {
      for (const unmapped of [false, true]) {
        await compare(makeFixture(count, { crlf, unmapped, sourceRoot: '/sources' }));
      }
    }
  }
});

test('compact leaves store code without per-fragment containers', async () => {
  const tree = await compare(makeFixture(100));
  const leaves = tree.children.filter(child => typeof child !== 'string');
  assert.ok(leaves.length > 0);
  for (const leaf of leaves) {
    assert.equal(typeof leaf.code, 'string');
    assert.deepEqual(Object.keys(leaf), ['line', 'column', 'source', 'name', 'code']);
    assert.equal(Object.hasOwn(leaf, '$$$isSourceNode$$$'), false);
    assert.equal(leaf.$$$isSourceNode$$$, true);
    assert.equal(Object.hasOwn(leaf, 'children'), false);
    assert.equal(Object.hasOwn(leaf, 'sourceContents'), false);
  }
  assert.equal(Object.keys(tree.sourceContents).length, 3);
});

test('distinct same-coordinate mappings and end-of-code spans preserve bytes', async () => {
  const generator = new SourceMapGenerator({ file: 'input.js' });
  for (const column of [0, 4]) {
    for (const line of [1, 2]) {
      generator.addMapping({ generated: { line: 1, column },
        original: { line, column: 0 }, source: 'original.js' });
    }
  }
  generator.setSourceContent('original.js', 'first\nsecond');
  await compare({ code: 'x=1;', map: generator.toJSON() });
});

test('indexed source maps preserve baseline serialization', async () => {
  const first = makeFixture(8, { unmapped: false });
  const second = makeFixture(8, { unmapped: false });
  await compare({ code: first.code + '\n' + second.code, map: {
    version: 3,
    sections: [
      { offset: { line: 0, column: 0 }, map: first.map },
      { offset: { line: first.code.split('\n').length, column: 0 }, map: second.map },
    ],
  } });
});

test('Unicode fragments and absent source contents preserve bytes', async () => {
  const chunks = ['"😀";', '"é";', '"漢字";'];
  const generator = new SourceMapGenerator({ file: 'unicode.js' });
  let column = 0;
  for (const [index, chunk] of chunks.entries()) {
    generator.addMapping({ generated: { line: 1, column },
      original: { line: index + 1, column: 0 }, source: 'unicode-source.js' });
    column += chunk.length;
  }
  const tree = await compare({ code: chunks.join(''), map: generator.toJSON() });
  assert.deepEqual(tree.sourceContents, {});
});

test('cached compact trees remain usable after their consumer is destroyed', async () => {
  const fixture = makeFixture(101, { sourceRoot: '/sources' });
  const consumer = await new SourceMapConsumer(fixture.map);
  let compact;
  let expected;
  try {
    compact = fromStringWithSourceMap(fixture.code, consumer);
    expected = SourceNode.fromStringWithSourceMap(fixture.code, consumer)
      .toStringWithSourceMap({ file: 'app.js' });
  } finally {
    consumer.destroy();
  }

  for (let repeat = 0; repeat < 3; repeat++) {
    const output = compact.toStringWithSourceMap({ file: 'app.js' });
    assert.equal(output.code, expected.code);
    assert.equal(output.map.toString(), expected.map.toString());
  }
});

test('compact TypeScript implementation and negative contracts pass strict checking', () => {
  const ts = require('typescript');
  const path = require('node:path');
  const program = ts.createProgram([
    path.join(__dirname, 'compact-source-node.ts'),
    path.join(__dirname, 'compact-source-node.contract-test.ts'),
  ], {
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noEmit: true,
    types: [],
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(
    diagnostics, {
      getCanonicalFileName: name => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    },
  ));
});
