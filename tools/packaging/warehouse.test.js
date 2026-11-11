const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../fs/files', () => {
  const fs = require('fs');
  const path = require('path');
  return {
    convertToStandardPath: p => p,
    usesWarehouse: () => !!process.env.METEOR_WAREHOUSE_DIR,
    pathJoin: path.join,
    exists: fs.existsSync,
    readFile: fs.readFileSync,
    mkdir_p: dir => fs.mkdirSync(dir, { recursive: true }),
    OfflineError: class OfflineError {},
  };
});

jest.mock('../utils/http-helpers.js', () => ({
  request: jest.fn(async () => ({ response: { statusCode: 404 } })),
}));

const httpHelpers = require('../utils/http-helpers.js');
const warehouse = require('./warehouse');

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};

let tmp;
let warehouseDir;
let releasesDir;
let outsideTools;
let originalWarehouseDir;

const manifestPathFor = name => path.join(releasesDir, name + '.release.json');
const toolsRelativeToWarehouse = dir => path.relative(path.join(warehouseDir, 'tools'), dir);
const releaseRelativeToWarehouse = file => path.relative(releasesDir, file);

beforeEach(() => {
  originalWarehouseDir = process.env.METEOR_WAREHOUSE_DIR;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-warehouse-'));
  warehouseDir = path.join(tmp, 'warehouse');
  releasesDir = path.join(warehouseDir, 'releases');
  outsideTools = path.join(tmp, 'outside', 'tools');
  fs.mkdirSync(path.join(warehouseDir, 'tools', 'abc'), { recursive: true });
  fs.mkdirSync(outsideTools, { recursive: true });
  process.env.METEOR_WAREHOUSE_DIR = warehouseDir;
  httpHelpers.request.mockClear();
});

afterEach(() => {
  if (originalWarehouseDir === undefined) {
    delete process.env.METEOR_WAREHOUSE_DIR;
  } else {
    process.env.METEOR_WAREHOUSE_DIR = originalWarehouseDir;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('legacy release in the warehouse', () => {
  test('a release stored in the warehouse is found and loaded', async () => {
    const manifest = { tools: 'abc', packages: {} };
    writeJson(manifestPathFor('v1'), manifest);

    expect(warehouse.realReleaseExistsInWarehouse('v1')).toBe(true);
    await expect(warehouse.ensureReleaseExistsAndReturnManifest('v1', true))
      .resolves.toEqual(manifest);
    expect(warehouse.getToolsDir('abc')).toBe(path.join(warehouseDir, 'tools', 'abc'));
  });

  test.each(['0.8.3', 'METEOR@3.0'])(
    'release %s missing from disk is requested from the warehouse server',
    async name => {
      expect(warehouse.realReleaseExistsInWarehouse(name)).toBe(false);
      await expect(warehouse.ensureReleaseExistsAndReturnManifest(name, true))
        .rejects.toBeInstanceOf(warehouse.NoSuchReleaseError);
      expect(httpHelpers.request).toHaveBeenCalledWith(
        expect.stringContaining('/releases/' + name + '.release.json'));
    });
});

describe('release names that do not name one warehouse entry', () => {
  test.each([
    ['an empty name', () => ''],
    ['"."', () => '.'],
    ['".."', () => '..'],
    ['a name with a forward slash', () => 'a/b'],
    ['a name with a backslash', () => '..\\x'],
    ['a relative path outside the warehouse', () => releaseRelativeToWarehouse(path.join(tmp, 'outside', 'x'))],
  ])('%s is refused even with a manifest at the path it names', async (_label, nameOf) => {
    const name = nameOf();
    writeJson(manifestPathFor(name), {
      tools: toolsRelativeToWarehouse(outsideTools),
      packages: {},
    });

    expect(warehouse.realReleaseExistsInWarehouse(name)).toBe(false);
    await expect(warehouse.ensureReleaseExistsAndReturnManifest(name, true))
      .rejects.toBeInstanceOf(warehouse.NoSuchReleaseError);
    expect(httpHelpers.request).not.toHaveBeenCalled();
  });

  test('red pill manifest outside the warehouse is not loaded from the server fallback', async () => {
    const name = releaseRelativeToWarehouse(path.join(tmp, 'outside', 'red'));
    writeJson(manifestPathFor(name), {
      tools: toolsRelativeToWarehouse(outsideTools),
      packages: {},
      redPill: true,
    });

    expect(warehouse.realReleaseExistsInWarehouse(name)).toBe(false);
    await expect(warehouse.ensureReleaseExistsAndReturnManifest(name, true))
      .rejects.toBeInstanceOf(warehouse.NoSuchReleaseError);
  });
});

describe('tools versions that do not name one warehouse entry', () => {
  test('a warehouse manifest whose tools escape the warehouse is refused', async () => {
    const tools = toolsRelativeToWarehouse(outsideTools);
    writeJson(manifestPathFor('v2'), { tools, packages: {} });

    await expect(warehouse.ensureReleaseExistsAndReturnManifest('v2', true))
      .rejects.toThrow('Invalid legacy tools version');
    expect(() => warehouse.getToolsDir(tools)).toThrow('Invalid legacy tools version');
  });

  test.each(['', '.', '..', 'a/b', '..\\x'])(
    'getToolsDir(%j) throws',
    version => {
      expect(() => warehouse.getToolsDir(version)).toThrow('Invalid legacy tools version');
    });
});
