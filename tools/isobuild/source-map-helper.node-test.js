require('../tool-env/install-babel.js');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SourceMapConsumer,
  SourceMapGenerator,
  SourceNode,
} = require('source-map');
const {
  createFileBackedSourceMap,
} = require('../utils/file-backed-source-map');
const {
  composeSourceMapRecipe,
  createSourceMapRecipe,
} = require('./source-map-helper');

const HELPER = process.env.METEOR_SOURCE_MAP_HELPER || path.resolve(
  __dirname,
  '../source-map-helper/target/debug/meteor-source-map-helper',
);

function makeFixture(count, { crlf = false, sourceRoot, unmapped = true } = {}) {
  const generator = new SourceMapGenerator({ file: 'input.js', sourceRoot });
  const newline = crlf ? '\r\n' : '\n';
  const lines = [];

  for (let index = 0; index < count; index++) {
    const line = Math.floor(index / 8) + 1;
    if (!lines[line - 1]) lines[line - 1] = '';

    const column = lines[line - 1].length;
    const mapping = { generated: { line, column } };
    if (!unmapped || index % 7 !== 0) {
      mapping.source = `module-${index % 3}.js`;
      mapping.original = { line: index % 50 + 1, column: index % 9 };
      if (index % 2 === 0) mapping.name = `name${index % 5}`;
    }
    generator.addMapping(mapping);
    if (index % 11 === 0) generator.addMapping({ ...mapping });
    lines[line - 1] += `x=${index}; `;
  }

  for (let source = 0; source < 3; source++) {
    generator.setSourceContent(
      `module-${source}.js`,
      Array.from({ length: 50 }, (_, line) => `// ${source}:${line}`).join('\n'),
    );
  }

  return {
    code: lines.join(newline) + (count ? `${newline}// unmapped tail` : ''),
    map: generator.toJSON(),
  };
}

async function runOracle(fixture, { file = 'output.js' } = {}) {
  const consumer = await new SourceMapConsumer(fixture.map);
  try {
    const mapped = SourceNode.fromStringWithSourceMap(fixture.code, consumer);
    return new SourceNode(null, null, null, [
      'header\n(',
      mapped,
      ')\nfooter',
    ]).toStringWithSourceMap({ file });
  } finally {
    consumer.destroy();
  }
}

function runHelper(fixture, { file = 'output.js' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'meteor-source-map-helper-'));
  const codePath = path.join(root, 'input.js');
  const inputMapPath = path.join(root, 'input.js.map');
  const outputCodePath = path.join(root, 'output.js');
  const outputMapPath = path.join(root, 'output.js.map');

  writeFileSync(codePath, fixture.code);
  writeFileSync(inputMapPath, JSON.stringify(fixture.map));

  const request = {
    protocolVersion: 1,
    workspaceRoot: root,
    output: {
      codePath: outputCodePath,
      mapPath: outputMapPath,
      file,
    },
    pieces: [
      { kind: 'literal', value: 'header\n(' },
      { kind: 'mapped', codePath, mapPath: inputMapPath },
      { kind: 'literal', value: ')\nfooter' },
    ],
  };
  const child = spawnSync(HELPER, [], {
    encoding: 'utf8',
    input: JSON.stringify(request),
  });

  assert.equal(child.status, 0, child.stdout || child.stderr);
  const response = JSON.parse(child.stdout);
  assert.equal(response.success, true);

  return {
    code: readFileSync(outputCodePath, 'utf8'),
    map: readFileSync(outputMapPath, 'utf8'),
  };
}

test('Rust helper matches source-map bytes for procedural basic maps', async () => {
  for (const count of [0, 1, 17, 101, 1000]) {
    for (const crlf of [false, true]) {
      for (const unmapped of [false, true]) {
        const fixture = makeFixture(count, {
          crlf,
          unmapped,
          sourceRoot: '/sources',
        });
        const expected = await runOracle(fixture);
        const actual = runHelper(fixture);

        assert.equal(actual.code, expected.code);
        assert.equal(actual.map, expected.map.toString());
      }
    }
  }
});

test('Rust helper matches Unicode columns and absent source contents', async () => {
  const chunks = ['"😀";', '"é";', '"漢字";'];
  const generator = new SourceMapGenerator({ file: 'unicode.js' });
  let column = 0;

  for (const [index, chunk] of chunks.entries()) {
    generator.addMapping({
      generated: { line: 1, column },
      original: { line: index + 1, column: 0 },
      source: 'unicode-source.js',
    });
    column += chunk.length;
  }

  const fixture = { code: chunks.join(''), map: generator.toJSON() };
  const expected = await runOracle(fixture);
  const actual = runHelper(fixture);

  assert.equal(actual.code, expected.code);
  assert.equal(actual.map, expected.map.toString());
});

test('Rust helper preserves URL schemes while normalizing source paths', async () => {
  const fixture = makeFixture(101, { unmapped: false });
  fixture.map.sources = fixture.map.sources.map(source =>
    `webpack://rspack-app/imports/./generated/${source}`
  );
  const expected = await runOracle(fixture);
  const actual = runHelper(fixture);

  assert.equal(actual.code, expected.code);
  assert.equal(actual.map, expected.map.toString());
});

test('Rust helper matches source-map 0.7.4 indexed-map behavior', async () => {
  const first = makeFixture(8, { unmapped: false });
  const second = makeFixture(8, { unmapped: false, sourceRoot: '/second' });
  const fixture = {
    code: `${first.code}\n${second.code}`,
    map: {
      version: 3,
      sections: [
        { offset: { line: 0, column: 0 }, map: first.map },
        {
          offset: { line: first.code.split('\n').length, column: 0 },
          map: second.map,
        },
      ],
    },
  };
  const expected = await runOracle(fixture);
  const actual = runHelper(fixture);

  assert.equal(actual.code, expected.code);
  assert.equal(actual.map, expected.map.toString());
});

test('Meteor adapter keeps map input file-backed and rewrites sources exactly', async () => {
  const fixture = makeFixture(101, { sourceRoot: '/sources' });
  const root = mkdtempSync(path.join(tmpdir(), 'meteor-source-map-adapter-'));
  const mapPath = path.join(root, 'input.js.map');
  const mapText = JSON.stringify(fixture.map);
  writeFileSync(mapPath, mapText);

  const expected = await runOracle(fixture);
  const expectedMap = expected.map.toJSON();
  expectedMap.sources = expectedMap.sources.map(source =>
    `meteor://💻app${source.startsWith('/') ? '' : '/'}${source}`
  );

  const actual = await composeSourceMapRecipe(createSourceMapRecipe([
    'header\n(',
    {
      code: fixture.code,
      map: createFileBackedSourceMap({
        path: mapPath,
        byteLength: Buffer.byteLength(mapText),
      }),
    },
    ')\nfooter',
  ]), {
    file: 'output.js',
    sourcePrefix: 'meteor://💻app',
  });

  assert.equal(actual.code, expected.code);
  assert.equal(readFileSync(actual.map.path, 'utf8'), JSON.stringify(expectedMap));
});
