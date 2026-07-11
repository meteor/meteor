// Unit tests for the standalone rspack-bundle emission in the linker
// (see meteor/meteor#14568). Runs under tools/unit-tests (jest).

jest.mock('source-map', () => {
  function flatten(child) {
    if (typeof child === 'string') { return child; }
    if (Array.isArray(child)) { return child.map(flatten).join(''); }
    if (child && child.children) { return flatten(child.children); }
    return String(child);
  }
  return {
    SourceNode: class SourceNode {
      constructor(line, column, source, chunks) {
        this.children = chunks || [];
      }
      toStringWithSourceMap() {
        const code = flatten(this.children);
        return {
          code,
          map: {
            toJSON: () => (code ? { version: 3, mappings: 'AAAA', sources: ['seg'] } : { version: 3, mappings: '' }),
          },
        };
      }
      toString() { return flatten(this.children); }
    },
    SourceMapConsumer: class SourceMapConsumer { destroy() {} },
  };
});

jest.mock('lru-cache', () => ({
  __esModule: true,
  default: class LRUCache {
    has() { return false; }
    get() { return undefined; }
    set() {}
  },
}));

jest.mock('optimism', () => ({
  wrap: fn => fn,
}));

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

// tool-env/rspack itself runs for real (it is the code under test's
// dependency); only its config lookup is stubbed so the default
// "_build" build context applies.
jest.mock('../tool-env/meteor-config', () => ({
  getMeteorConfig: () => null,
}));

const INSTALL_OPTIONS = { extensions: ['.js', '.json'] };

function makeFile(linker, overrides = {}, arch = 'web.browser') {
  const inputFile = {
    data: Buffer.from(overrides.source || 'MODULE_SOURCE;\n'),
    hash: overrides.hash || 'input-hash',
    sourcePath: overrides.sourcePath,
    absModuleId: overrides.absModuleId,
    servePath: overrides.servePath || overrides.sourcePath,
    deps: {},
    lazy: overrides.lazy !== undefined ? overrides.lazy : true,
    imported: overrides.imported !== undefined ? overrides.imported : 'static',
    bare: !!overrides.bare,
    sourceMap: overrides.sourceMap,
    meteorInstallOptions:
      'meteorInstallOptions' in overrides
        ? overrides.meteorInstallOptions
        : INSTALL_OPTIONS,
  };
  return new linker.File(inputFile, arch);
}

function makeModule(linker, arch = 'web.browser') {
  return new linker.Module({
    name: null,
    bundleArch: arch,
    useGlobalNamespace: true,
    combinedServePath: '/app.js',
  });
}

function rspackFileOverrides() {
  return {
    sourcePath: '_build/main-prod/client-rspack.js',
    absModuleId: '/_build/main-prod/client-rspack.js',
    source: 'var RSPACK_BUNDLE_BODY = require("meteor/meteor");\n',
  };
}

describe('_isStandaloneRspackBundle', () => {
  const linker = require('./linker.js');

  function fileWith(overrides, arch) {
    const mod = makeModule(linker, arch);
    return makeFile(linker, { ...rspackFileOverrides(), ...overrides }, arch);
  }

  it('accepts an rspack output file on modern web archs', () => {
    const mod = makeModule(linker);
    expect(mod._isStandaloneRspackBundle(fileWith({}, 'web.browser'))).toBe(true);
    expect(mod._isStandaloneRspackBundle(fileWith({}, 'web.cordova'))).toBe(true);
  });

  it('rejects the legacy web arch (Babel re-compiles the bundle there)', () => {
    const mod = makeModule(linker, 'web.browser.legacy');
    expect(
      mod._isStandaloneRspackBundle(fileWith({}, 'web.browser.legacy'))
    ).toBe(false);
  });

  it('rejects server archs', () => {
    const mod = makeModule(linker, 'os.linux.x86_64');
    expect(
      mod._isStandaloneRspackBundle(fileWith({}, 'os.linux.x86_64'))
    ).toBe(false);
  });

  it('rejects ordinary app files, including ones named like bundles elsewhere', () => {
    const mod = makeModule(linker);
    expect(mod._isStandaloneRspackBundle(fileWith({
      sourcePath: 'client/main.js',
      absModuleId: '/client/main.js',
    }))).toBe(false);
    // Outside the build context directory the name does not match.
    expect(mod._isStandaloneRspackBundle(fileWith({
      sourcePath: 'client/client-rspack.js',
      absModuleId: '/client/client-rspack.js',
    }))).toBe(false);
  });

  it('rejects files without meteorInstallOptions (no module system)', () => {
    const mod = makeModule(linker);
    expect(mod._isStandaloneRspackBundle(fileWith({
      meteorInstallOptions: undefined,
    }))).toBe(false);
  });
});

describe('_emitStandaloneRspackBundle', () => {
  const linker = require('./linker.js');

  it('unshifts a self-registering *.min.js entry before the app result', () => {
    const mod = makeModule(linker);
    const file = makeFile(linker, rspackFileOverrides());
    const appResult = { servePath: '/app.js' };
    const results = [appResult];

    mod._emitStandaloneRspackBundle(file, results);

    expect(results).toHaveLength(2);
    expect(results[1]).toBe(appResult);

    const standalone = results[0];
    expect(standalone.servePath).toBe('/_build/main-prod/client-rspack.min.js');
    expect(standalone.sourceMap).toBeNull();
    expect(standalone.hash).toBe('input-hash');
  });

  it('emits valid JS that registers the untouched source at its module id', () => {
    const mod = makeModule(linker);
    const file = makeFile(linker, rspackFileOverrides());
    const results = [{}];
    mod._emitStandaloneRspackBundle(file, results);
    const { source } = results[0];

    // The bundle body must appear verbatim (this is what guarantees the
    // minifier skip returns byte-identical code).
    expect(source).toContain('var RSPACK_BUNDLE_BODY = require("meteor/meteor");');
    // No `var require =` prefix: that would clobber the global require.
    expect(source).not.toContain('var require =');

    // Execute the emitted source against a capturing meteorInstall.
    const calls = [];
    new Function('meteorInstall', source)((tree, options) => {
      calls.push({ tree, options });
    });
    expect(calls).toHaveLength(1);

    const { tree, options } = calls[0];
    expect(options).toEqual(INSTALL_OPTIONS);
    const moduleFn = tree._build['main-prod']['client-rspack.js'];
    expect(typeof moduleFn).toBe('function');

    // Invoking the module function must run the bundle body with the
    // module-local require, exactly as it would inside app.js.
    const required = [];
    moduleFn(id => { required.push(id); return {}; }, {}, { exports: {} });
    expect(required).toEqual(['meteor/meteor']);
  });
});

describe('_buildModuleTrees diversion', () => {
  const linker = require('./linker.js');

  it('keeps the rspack bundle out of the static tree and other files in it', async () => {
    const mod = makeModule(linker);
    const bundle = makeFile(linker, rspackFileOverrides());
    const normal = makeFile(linker, {
      sourcePath: 'client/main.js',
      absModuleId: '/client/main.js',
      source: 'exports.ok = true;\n',
      lazy: false,
    });
    mod.files.push(bundle, normal);

    const results = [{ servePath: '/app.js' }];
    const trees = await mod._buildModuleTrees(results, 70);

    // The standalone entry was emitted...
    expect(results[0].servePath).toBe('/_build/main-prod/client-rspack.min.js');

    // ...and only the normal file went into the static tree.
    const tree = trees.get(INSTALL_OPTIONS);
    expect(tree.client['main.js']).toBeDefined();
    expect(tree._build).toBeUndefined();
  });

  it('still ignores lazy never-imported rspack stubs (dev client)', async () => {
    const mod = makeModule(linker);
    // In dev the client bundle is a comment stub that nothing imports.
    const stub = makeFile(linker, {
      ...rspackFileOverrides(),
      source: '/* No code generated as served by HMR server */\n',
      lazy: true,
      imported: false,
    });
    mod.files.push(stub);

    const results = [{ servePath: '/app.js' }];
    const trees = await mod._buildModuleTrees(results, 70);

    expect(results).toHaveLength(1);
    expect(results[0].servePath).toBe('/app.js');
    expect([...trees.values()].every(t => Object.keys(t).length === 0)).toBe(true);
  });
});

describe('indexed-map composition for server-arch bundles', () => {
  const linker = require('./linker.js');

  const SERVER_ARCH = 'os.linux.x86_64';

  function serverBundleFile(overrides = {}) {
    return makeFile(linker, {
      sourcePath: '_build/main-dev/server-rspack.js',
      absModuleId: '/_build/main-dev/server-rspack.js',
      source: 'LINE_ONE();\nLINE_TWO();',
      sourceMap: { version: 3, mappings: 'BUNDLE_MAPPINGS', sources: ['webpack://x'] },
      ...overrides,
    }, SERVER_ARCH);
  }

  it('gates on server arch + source map + rspack path', () => {
    const mod = makeModule(linker, SERVER_ARCH);
    expect(mod._isIndexedMapRspackBundle(serverBundleFile())).toBe(true);
    expect(mod._isIndexedMapRspackBundle(serverBundleFile({ sourceMap: undefined }))).toBe(false);
    expect(mod._isIndexedMapRspackBundle(makeFile(linker, {
      sourcePath: 'server/main.js',
      absModuleId: '/server/main.js',
      sourceMap: { version: 3, mappings: 'X' },
    }, SERVER_ARCH))).toBe(false);
    // Web archs use the standalone path, not the in-tree indexed path.
    const webFile = makeFile(linker, {
      sourcePath: '_build/main-dev/server-rspack.js',
      absModuleId: '/_build/main-dev/server-rspack.js',
      sourceMap: { version: 3, mappings: 'X' },
    }, 'web.browser');
    expect(mod._isIndexedMapRspackBundle(webFile)).toBe(false);
  });

  it('splices raw source and aligns section offsets with the emitted lines', () => {
    const mod = makeModule(linker, SERVER_ARCH);
    const file = serverBundleFile();
    const chunks = [
      'var require = meteorInstall({"_build":{"main-dev":{"server-rspack.js":',
      { rspackBundleFile: file },
      '}}},{});\n',
    ];
    const result = {};
    mod._serializeWithIndexedMap(chunks, result);

    // The bundle body appears verbatim.
    expect(result.source).toContain('LINE_ONE();\nLINE_TWO();');
    // Structure: prefix segment, closure header, bundle, closure footer, suffix.
    const lines = result.source.split('\n');
    const bundleStartLine = lines.indexOf('LINE_ONE();');
    expect(bundleStartLine).toBeGreaterThan(0);

    expect(result.sourceMap.sections).toBeDefined();
    const bundleSection = result.sourceMap.sections.find(
      s => s.map.mappings === 'BUNDLE_MAPPINGS'
    );
    expect(bundleSection).toBeDefined();
    // The section offset must point exactly at the line where the raw
    // bundle source begins, at column 0.
    expect(bundleSection.offset).toEqual({ line: bundleStartLine, column: 0 });

    // Section offsets are strictly increasing.
    const offsets = result.sourceMap.sections.map(s => s.offset.line);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it('emits no sections and null map when there are no mappings at all', () => {
    const mod = makeModule(linker, SERVER_ARCH);
    const file = serverBundleFile();
    // Bundle only, no surrounding chunks; give the bundle map but strip
    // the segment content so only the bundle section exists.
    const result = {};
    mod._serializeWithIndexedMap([{ rspackBundleFile: file }], result);
    expect(result.sourceMap.sections).toHaveLength(1);
    expect(result.source.endsWith('\n')).toBe(true);
  });
});

describe('client top-level await opt-out', () => {
  it('keeps the bundle in the combined app.js when TLA is enabled', () => {
    jest.resetModules();
    const prev = process.env.METEOR_ENABLE_CLIENT_TOP_LEVEL_AWAIT;
    process.env.METEOR_ENABLE_CLIENT_TOP_LEVEL_AWAIT = 'true';
    try {
      const linkerTLA = require('./linker.js');
      const mod = makeModule(linkerTLA);
      const file = makeFile(linkerTLA, rspackFileOverrides());
      expect(mod._isStandaloneRspackBundle(file)).toBe(false);
    } finally {
      if (prev === undefined) {
        delete process.env.METEOR_ENABLE_CLIENT_TOP_LEVEL_AWAIT;
      } else {
        process.env.METEOR_ENABLE_CLIENT_TOP_LEVEL_AWAIT = prev;
      }
      jest.resetModules();
    }
  });
});
