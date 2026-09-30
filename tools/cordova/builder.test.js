// builder.js pulls in most of the Meteor tool-chain. None of it is needed to
// generate the bootstrap page, so it is stubbed out.
jest.mock('../console/console.js', () => ({ Console: {} }));
jest.mock('../utils/buildmessage.js', () => ({}));
jest.mock('../fs/files', () => ({
  pathJoin: (...parts) => parts.join('/'),
  pathBasename: (p) => p.split('/').pop(),
  exists: () => false,
  findGitCommitHash: () => 'synthetic-commit',
}));
jest.mock('../fs/optimistic', () => ({ optimisticReadJsonOrNull: () => null }));
jest.mock('../packaging/release.js', () => ({
  current: { isCheckout: () => true },
}));
jest.mock('../tool-env/isopackets.js', () => ({
  loadIsopackage: async () => ({
    Boilerplate: class {
      constructor(arch, manifest, { baseDataExtension }) {
        this.config = baseDataExtension.meteorRuntimeConfig;
      }

      async toHTMLAsync() {
        return JSON.parse(decodeURIComponent(JSON.parse(this.config)));
      }
    },
  }),
}));
jest.mock('../utils/utils.js', () => ({
  parseUrl: (url) => new URL(url),
  isIPv4Address: () => false,
}));
jest.mock('xmlbuilder2', () => ({}), { virtual: true });
jest.mock('./index.js', () => ({ CORDOVA_ARCH: 'web.cordova', SWIFT_VERSION: '5' }));

const { CordovaBuilder } = require('./builder.js');

function runtimeConfigFor(options) {
  const builder = new CordovaBuilder(
    { appIdentifier: 'syntheticappid', projectDir: '/app' },
    '/app/.meteor/local/cordova-build',
    {
      mobileServerUrl: 'http://192.168.0.10:3000/',
      buildMode: 'development',
      ...options,
    }
  );

  return builder.generateBootstrapPage('/www/application', {
    manifest: [],
    version: 'v',
    versionRefreshable: 'vr',
    versionNonRefreshable: 'vnr',
    versionReplaceable: 'vrep',
  });
}

describe('CordovaBuilder#generateBootstrapPage', () => {
  test('includes the HMR secret when meteor run provides one', async () => {
    const config = await runtimeConfigFor({ hmrSecret: 'synthetic-hmr-secret' });

    expect(config._hmrSecret).toBe('synthetic-hmr-secret');
    expect(config.appId).toBe('syntheticappid');
  });

  test('omits the HMR secret otherwise', async () => {
    const config = await runtimeConfigFor({});

    expect(config).not.toHaveProperty('_hmrSecret');
  });
});
