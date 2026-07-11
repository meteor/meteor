// Regression tests for the indexed-source-map composition using the REAL
// source-map library (unlike linker-rspack.test.js, which mocks it):
// positions inside the spliced rspack bundle must resolve through the
// composed indexed map, including after the TLA header wrap.
// See meteor/meteor#14568.

jest.mock('lru-cache', () => ({
  __esModule: true,
  default: class LRUCache {
    has() { return false; }
    get() { return undefined; }
    set() {}
  },
}), { virtual: true });

jest.mock('optimism', () => ({
  wrap: fn => fn,
}), { virtual: true });

jest.mock('../utils/buildmessage.js', () => ({
  error: jest.fn(),
  assertInJob: jest.fn(),
  jobHasMessages: jest.fn(() => false),
  enterJob: jest.fn((opts, fn) => fn()),
}));

jest.mock('../fs/watch', () => ({
  sha1: str => `sha1(${String(str).length})`,
}));

jest.mock('../tool-env/profile', () => {
  const Profile = (name, fn) => fn;
  Profile.time = (name, fn) => fn();
  return { Profile };
});

jest.mock('../utils/utils.js', () => ({
  sourceMapLength: () => 0,
}));

jest.mock('../fs/files', () => ({
  __esModule: true,
  default: {
    pathJoin: (...args) => args.join('/'),
    exists: () => false,
    readFile: () => { throw new Error('not available in tests'); },
  },
}));

jest.mock('./js-analyze.js', () => ({
  findAssignedGlobals: () => ({}),
}));

jest.mock('../utils/colon-converter.js', () => ({
  convert: p => p,
}));

jest.mock('../tool-env/meteor-config', () => ({
  getMeteorConfig: () => null,
}));

const { SourceMapGenerator, SourceMapConsumer } = require('source-map');
const linker = require('./linker.js');

const SERVER_ARCH = 'os.linux.x86_64';
const INSTALL_OPTIONS = { extensions: ['.js'] };

// A three-line "bundle" whose map points each generated line at a
// distinct original file/line.
function makeBundle() {
  const source = 'bundleLineA();\nbundleLineB();\nbundleLineC();';
  const gen = new SourceMapGenerator({ file: 'server-rspack.js' });
  [
    ['orig/alpha.js', 11],
    ['orig/beta.js', 22],
    ['orig/gamma.js', 33],
  ].forEach(([src, origLine], i) => {
    gen.addMapping({
      generated: { line: i + 1, column: 0 },
      original: { line: origLine, column: 0 },
      source: src,
    });
  });
  return { source, sourceMap: JSON.parse(gen.toString()) };
}

function makeRspackFile() {
  const { source, sourceMap } = makeBundle();
  return new linker.File({
    data: Buffer.from(source),
    hash: 'bundle-hash',
    sourcePath: '_build/main-dev/server-rspack.js',
    absModuleId: '/_build/main-dev/server-rspack.js',
    servePath: '_build/main-dev/server-rspack.js',
    deps: {},
    lazy: true,
    imported: 'static',
    sourceMap,
    meteorInstallOptions: INSTALL_OPTIONS,
  }, SERVER_ARCH);
}

function compose() {
  const mod = new linker.Module({
    name: null,
    bundleArch: SERVER_ARCH,
    useGlobalNamespace: true,
    combinedServePath: '/app.js',
  });
  const file = makeRspackFile();
  const chunks = [
    'var require = meteorInstall({"_build":{"main-dev":{"server-rspack.js":',
    { rspackBundleFile: file },
    '}}},{});\n',
  ];
  const result = {};
  mod._serializeWithIndexedMap(chunks, result);
  return result;
}

function findLine(source, needle) {
  const idx = source.split('\n').findIndex(l => l.includes(needle));
  expect(idx).toBeGreaterThanOrEqual(0);
  return idx + 1; // 1-based, as SourceMapConsumer expects
}

// source-map 0.6's consumer constructor is synchronous; 0.7's returns a
// promise (and needs destroy()). `await` handles both.
async function withConsumer(map, fn) {
  const consumer = await new SourceMapConsumer(map);
  try {
    return fn(consumer);
  } finally {
    if (typeof consumer.destroy === 'function') {
      consumer.destroy();
    }
  }
}

describe('indexed map with the real source-map library', () => {
  it('is syntactically valid JavaScript', () => {
    const { source } = compose();
    expect(() => new Function('meteorInstall', source)).not.toThrow();
  });

  it('resolves generated positions inside the bundle to original sources', async () => {
    const result = compose();
    await withConsumer(result.sourceMap, consumer => {
      const lineB = findLine(result.source, 'bundleLineB();');
      const pos = consumer.originalPositionFor({ line: lineB, column: 0 });
      expect(pos.source).toBe('orig/beta.js');
      expect(pos.line).toBe(22);

      const lineC = findLine(result.source, 'bundleLineC();');
      const posC = consumer.originalPositionFor({ line: lineC, column: 0 });
      expect(posC.source).toBe('orig/gamma.js');
      expect(posC.line).toBe(33);
    });
  });

  it('still resolves after wrapWithHeaderAndFooter shifts the sections', async () => {
    const result = compose();
    const header = '(function () {\nvar deps = [];\n';
    const footer = '\n})();\n';
    const [wrapped] = linker.wrapWithHeaderAndFooter([
      {
        source: result.source,
        sourcePath: 'app.js',
        servePath: '/app.js',
        sourceMap: result.sourceMap,
      },
    ], header, footer);

    await withConsumer(wrapped.sourceMap, consumer => {
      // Probe the bundle's second line: source-map 0.6's indexed
      // consumer has an off-by-one on a section's FIRST line at column
      // 0 (needle columns are raw while section offsets are stored
      // +1), fixed in 0.7. Later lines resolve on both versions.
      const lineB = findLine(wrapped.source, 'bundleLineB();');
      const pos = consumer.originalPositionFor({ line: lineB, column: 0 });
      expect(pos.source).toBe('orig/beta.js');
      expect(pos.line).toBe(22);
    });
  });
});
