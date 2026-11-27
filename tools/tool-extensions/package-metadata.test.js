jest.mock('../fs/files', () => ({
  inCheckout: jest.fn(() => true),
  pathJoin: require('node:path').join,
  exists: require('node:fs').existsSync,
  readFile: require('node:fs').readFileSync,
}));
jest.mock('../utils/buildmessage.js', () => ({
  error: jest.fn(),
}));
jest.mock('../packaging/package-version-parser.js', () => ({
  getValidServerVersion: jest.fn(version => version),
}));
jest.mock('../tool-env/meteor-config', () => ({
  getMeteorConfig: jest.fn(),
  getProjectPlatforms: jest.fn(),
}));
jest.mock('../isobuild/meteor-npm.js', () => ({}));
jest.mock('../isobuild/compiler.js', () => ({
  BUILT_BY: 'test',
  isIsobuildFeaturePackage: jest.fn(() => false),
}));
jest.mock('../utils/archinfo', () => ({}));
jest.mock('../isobuild/linker.js', () => ({}));
jest.mock('../isobuild/builder.js', () => ({
  __esModule: true,
  default: class Builder {},
}));
jest.mock('../isobuild/bundler.js', () => ({}));
jest.mock('../fs/watch', () => ({
  WatchSet: class WatchSet {
    clone() {
      return new WatchSet();
    }

    merge() {}

    toJSON() {
      return {};
    }

    static fromJSON() {
      return new WatchSet();
    }
  },
}));
jest.mock('../fs/fsFixPath', () => ({}));
jest.mock('../tool-env/isopackets.js', () => ({
  ISOPACKETS: {},
  makeIsopacketBuildContext: jest.fn(),
}));
jest.mock('../utils/colon-converter.js', () => ({
  convert: jest.fn(path => path),
}));
jest.mock('../utils/utils.js', () => ({}));
jest.mock('../isobuild/build-plugin.js', () => ({}));
jest.mock('../console/console.js', () => ({
  Console: {
    nudge: jest.fn(),
    yield: jest.fn(),
  },
}));
jest.mock('../tool-env/profile', () => ({
  Profile: (...args) => args.filter(arg => typeof arg === 'function').pop(),
}));
jest.mock('../utils/gc.js', () => ({
  requestGarbageCollection: jest.fn(),
}));
jest.mock('../isobuild/unibuild.js', () => ({
  Unibuild: class Unibuild {
    static async fromJSON() {
      return new Unibuild();
    }
  },
}));
jest.mock('../tool-env/rspack', () => ({}));
jest.mock('../runners/run-log', () => ({
  runLogInstance: {},
}));

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PackageMap } = require('../packaging/package-map.js');
const { IsopackCache } = require('../isobuild/isopack-cache.js');
const { createRegistryForProject } = require('./project.js');
const { PackageNamespace } = require('../isobuild/package-namespace.js');
const { Isopack } = require('../isobuild/isopack.js');

function makePackageSource({ isTest = false } = {}) {
  return {
    isTest,
    metadata: {},
    pluginInfo: {},
    toolExtensions: [],
  };
}

describe('Package.registerToolExtension', () => {
  test('stores extension metadata on package sources', () => {
    const packageSource = makePackageSource();
    const Package = new PackageNamespace(packageSource);

    Package.registerToolExtension({
      id: 'meteor:capacitor',
      apiVersion: '1.0',
      platforms: [],
      buildTargets: [],
      capabilities: {},
    });

    expect(packageSource.toolExtensions).toEqual([
      {
        id: 'meteor:capacitor',
        apiVersion: '1.0',
        platforms: [],
        buildTargets: [],
        capabilities: {},
      },
    ]);
  });

  test('ignores extension metadata declared in package tests', () => {
    const packageSource = makePackageSource({ isTest: true });
    const Package = new PackageNamespace(packageSource);

    Package.registerToolExtension({
      id: 'meteor:test',
      apiVersion: '1.0',
    });

    expect(packageSource.toolExtensions).toEqual([]);
  });
});

describe('Isopack tool extension metadata', () => {
  test('discovers local and installed providers before isopacks load', async () => {
    const local = {
      id: 'test:local',
      apiVersion: '1.0',
      platforms: [{ name: 'local', provider: 'local', nativeProjectDir: 'local-app' }],
    };
    const installed = {
      id: 'test:installed',
      apiVersion: '1.0',
      platforms: [{ name: 'android', provider: 'installed', nativeProjectDir: 'android' }],
    };
    const packageMap = new PackageMap({ local: '1.0.0', installed: '2.0.0' }, {
      localCatalog: {
        getPackageSource: name => name === 'local' ? { toolExtensions: [local] } : null,
      },
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-extensions-'));
    try {
      const packagePath = (name, version) => path.join(root, name, version);
      const dir = packagePath('installed', '2.0.0');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'isopack.json'), JSON.stringify({
        'isopack-2': { toolExtensions: [installed] },
      }));
      const isopackCache = new IsopackCache({ packageMap, tropohouse: { packagePath } });
      const registry = await createRegistryForProject({ packageMap, isopackCache });
      expect(registry.resolvePlatform('local')).toMatchObject({
        extension: { packageName: 'local' }, platform: { nativeProjectDir: 'local-app' },
      });
      expect(registry.resolvePlatform('android')).toMatchObject({
        extension: { packageName: 'installed' }, platform: { nativeProjectDir: 'android' },
        isFallback: false,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('starts with empty tool extension metadata', () => {
    const isopack = new Isopack();

    expect(isopack.toolExtensions).toEqual([]);
  });

  test('copies tool extension metadata from init options', () => {
    const toolExtensions = [
      {
        id: 'meteor:capacitor',
        apiVersion: '1.0',
        platforms: [{ name: 'android', provider: 'capacitor' }],
      },
    ];
    const isopack = new Isopack();

    isopack.initFromOptions({
      name: 'capacitor',
      metadata: {},
      version: '1.0.0',
      isTest: false,
      plugins: {},
      cordovaDependencies: {},
      pluginWatchSet: {},
      npmDiscards: [],
      includeTool: false,
      debugOnly: false,
      prodOnly: false,
      testOnly: false,
      devOnly: false,
      isobuildFeatures: [],
      toolExtensions,
    });

    expect(isopack.toolExtensions).toEqual(toolExtensions);
  });
});
