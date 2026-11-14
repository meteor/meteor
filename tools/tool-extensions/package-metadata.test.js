jest.mock('../fs/files', () => ({
  inCheckout: jest.fn(() => true),
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
