import path from 'path';
import fs from 'fs-extra';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import {
  buildMeteorApp,
  cleanupTempDir,
  clearBuildArtifacts,
  isRetryAttempt,
  runMeteorCommand,
  setupMeteorApp,
} from './helpers';

const { linkLocalRspack: _linkLocalRspack } = require('./scripts/link-rspack');
const npmLinkLocalRspack = process.env.NPM_LINK_RSPACK !== 'false';

async function linkLocalRspack(appDir) {
  if (!npmLinkLocalRspack) return;
  await _linkLocalRspack(appDir);
}

async function setMinifierConfig(appDir, minifier) {
  const pkgPath = path.join(appDir, 'package.json');
  const pkg = await fs.readJson(pkgPath);
  pkg.meteor.modern = { minifier };
  await fs.writeJson(pkgPath, pkg, { spaces: 2 });
}

// A package file with its own source map, whose source path is relative to that file.
async function addVendorPackageWithMap(appDir) {
  const packageDir = path.join(appDir, 'packages', 'vendor-with-map');
  await fs.outputFile(path.join(packageDir, 'package.js'), [
    "Package.describe({ name: 'vendor-with-map', version: '0.0.1' });",
    "Package.onUse((api) => {",
    "  api.use('ecmascript');",
    "  api.addFiles('dist/vendor.js', 'client');",
    "});",
  ].join('\n'));
  await fs.outputFile(
    path.join(packageDir, 'dist', 'vendor.js'),
    'window.vendorWithMapAnswer = function () { return 42; };\n//# sourceMappingURL=vendor.js.map\n'
  );
  await fs.outputJson(path.join(packageDir, 'dist', 'vendor.js.map'), {
    version: 3,
    file: 'vendor.js',
    sources: ['../src/vendor.ts'],
    sourcesContent: ['export const vendorWithMapAnswer = () => 42;'],
    names: [],
    mappings: 'AAAA',
  });
  await runMeteorCommand('add', ['vendor-with-map'], appDir, { checkExitCode: true });
}

async function readClientBundle(buildOutputDir) {
  const clientDir = path.join(buildOutputDir, 'bundle', 'programs', 'web.browser');
  const program = await fs.readJson(path.join(clientDir, 'program.json'));
  const item = program.manifest.find(
    (entry) => entry.type === 'js' && entry.where === 'client' && !entry.path.startsWith('dynamic/')
  );
  return {
    clientDir,
    item,
    code: await fs.readFile(path.join(clientDir, item.path), 'utf8'),
    mapPath: path.join(clientDir, `${item.path}.map`),
  };
}

describe('Regressions / Minifier production source maps /', () => {
  let tempDir;
  const buildOutputDirs = [];

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp('react'));
    await runMeteorCommand('add', ['rspack'], tempDir, { checkExitCode: true });
    await linkLocalRspack(tempDir);
    await addVendorPackageWithMap(tempDir);
  }, 600000);

  afterAll(async () => {
    for (const dir of buildOutputDirs) await cleanupTempDir(dir);
    if (tempDir) await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    if (isRetryAttempt() && tempDir) {
      await clearBuildArtifacts(tempDir);
    }
  });

  async function build(minifier) {
    await setMinifierConfig(tempDir, minifier);
    const { buildOutputDir } = await buildMeteorApp(tempDir, {
      commandOptions: ['--directory', '--server-only'],
    });
    buildOutputDirs.push(buildOutputDir);
    return readClientBundle(buildOutputDir);
  }

  test('"hidden" writes a plain source map that the server does not serve', async () => {
    const { item, code, mapPath } = await build({ sourceMap: 'hidden' });

    expect(item.sourceMap).toBeUndefined();
    expect(item.sourceMapUrl).toBeUndefined();
    expect(code).not.toMatch(/sourceMappingURL/);

    const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
    const helloIndex = map.sources.findIndex((source) => source.endsWith('imports/ui/Hello.jsx'));
    expect(helloIndex).toBeGreaterThanOrEqual(0);
    expect(map.sourcesContent[helloIndex]).toContain('Click Me');

    const lines = code.split('\n');
    const line = lines.findIndex((text) => text.includes('Click Me'));
    const column = lines[line].indexOf('Click Me');
    const original = originalPositionFor(new TraceMap(map), { line: line + 1, column });
    expect(original.source).toMatch(/imports\/ui\/Hello\.jsx$/);
    expect(map.sourcesContent[helloIndex].split('\n')[original.line - 1]).toContain('Click Me');
  });

  test('a source path relative to its package file resolves inside that package', async () => {
    const { mapPath } = await build({ sourceMap: 'hidden' });

    const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
    const vendorIndex = map.sources.findIndex((source) => source.endsWith('/vendor.ts'));
    expect(map.sources[vendorIndex]).toBe('meteor://💻app/packages/vendor-with-map/src/vendor.ts');
    expect(map.sourcesContent[vendorIndex]).toContain('vendorWithMapAnswer');
    expect(map.sources.filter((source) => source.includes('../'))).toEqual([]);
  });

  test('true writes the source map and serves it next to the bundle', async () => {
    const { item, mapPath } = await build({ sourceMap: true });

    expect(item.sourceMap).toBeDefined();
    expect(item.sourceMapUrl).toMatch(/\.map$/);
    expect(await fs.readFile(mapPath, 'utf8')).toMatch(/^\)\]\}'\n/);
  });

  test('without the option the bundle has no source map', async () => {
    const { item, mapPath } = await build(true);

    expect(item.sourceMapUrl).toBeUndefined();
    expect(await fs.pathExists(mapPath)).toBe(false);
  });
});
