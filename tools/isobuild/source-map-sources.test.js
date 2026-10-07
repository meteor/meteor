const { resolveFileRelativeSources } = require('./source-map-sources.js');

const servePath = '/packages/minified-vendor/dist/plain.js';
const map = (fields) => ({ version: 3, names: [], mappings: 'AAAA', ...fields });

describe('resolveFileRelativeSources', () => {
  it('resolves ../ sources against the file', () => {
    const result = resolveFileRelativeSources(map({ sources: ['../src/plain.ts'] }), servePath);
    expect(result.sources).toEqual(['packages/minified-vendor/src/plain.ts']);
  });

  it('resolves ./ sources against the file', () => {
    const result = resolveFileRelativeSources(map({ sources: ['./util.js'] }), servePath);
    expect(result.sources).toEqual(['packages/minified-vendor/dist/util.js']);
  });

  it('joins a relative sourceRoot into the sources before resolving them', () => {
    const result = resolveFileRelativeSources(
      map({ sourceRoot: '../src', sources: ['plain.ts'] }),
      servePath
    );
    expect(result.sources).toEqual(['packages/minified-vendor/src/plain.ts']);
    expect(result).not.toHaveProperty('sourceRoot');
  });

  it('resolves a sourceRoot without ./ or ../ against the file, as the spec does', () => {
    for (const sourceRoot of ['src', 'src/']) {
      const result = resolveFileRelativeSources(map({ sourceRoot, sources: ['plain.ts'] }), servePath);
      expect(result.sources).toEqual(['packages/minified-vendor/dist/src/plain.ts']);
    }
  });

  it('keeps sources that are absolute even with a relative sourceRoot', () => {
    const result = resolveFileRelativeSources(
      map({ sourceRoot: 'src', sources: ['plain.ts', 'webpack:///client/main.ts', '/node_modules/x.js'] }),
      servePath
    );
    expect(result.sources).toEqual([
      'packages/minified-vendor/dist/src/plain.ts',
      'webpack:///client/main.ts',
      '/node_modules/x.js',
    ]);
  });

  it('keeps app-root paths, URLs and absolute paths', () => {
    const sources = [
      'packages/ejson/ejson.js',
      'meteor://💻app/packages/ejson/ejson.js',
      'webpack:///client/main.ts',
      '/node_modules/react/index.js',
      '../src/plain.ts',
    ];
    const result = resolveFileRelativeSources(map({ sources }), servePath);
    expect(result.sources).toEqual([...sources.slice(0, 4), 'packages/minified-vendor/src/plain.ts']);
  });

  it('returns the same map when no source is file-relative', () => {
    const sourceMap = map({ sourceRoot: 'webpack://app/', sources: ['src/a.ts'] });
    expect(resolveFileRelativeSources(sourceMap, servePath)).toBe(sourceMap);
  });

  it('keeps the rest of the map', () => {
    const sourceMap = map({ sources: ['../src/plain.ts'], sourcesContent: ['answer'], file: 'plain.js' });
    const result = resolveFileRelativeSources(sourceMap, servePath);
    expect(result).toMatchObject({ mappings: 'AAAA', sourcesContent: ['answer'], file: 'plain.js' });
  });

  it('accepts a missing map or serve path', () => {
    expect(resolveFileRelativeSources(null, servePath)).toBeNull();
    const sourceMap = map({ sources: ['../src/plain.ts'] });
    expect(resolveFileRelativeSources(sourceMap, undefined)).toBe(sourceMap);
  });
});
