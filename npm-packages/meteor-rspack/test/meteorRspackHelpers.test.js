const assert = require('node:assert/strict');
const test = require('node:test');

const {
  NATIVE_ADDON_EXTERNALIZATION_CONFIG,
  compileWithRspack,
  configureNativeAddonExternalization,
  consumeNativeAddonExternalizationConfig,
} = require('../lib/meteorRspackHelpers.js');
const {
  mergeMeteorRspackFragments,
} = require('../lib/meteorRspackConfigFactory.js');

function unwrapConfigFragment(fragment) {
  const configs = Object.values(fragment);
  assert.equal(configs.length, 1);
  return configs[0];
}

test('configures native addon externalization through an internal fragment', () => {
  const condition = /false-positive/;
  const config = unwrapConfigFragment(
    configureNativeAddonExternalization({
      enabled: false,
      forceBundle: ['false-positive-package', condition],
    })
  );

  assert.deepEqual(config[NATIVE_ADDON_EXTERNALIZATION_CONFIG], {
    enabled: false,
    forceBundle: ['false-positive-package', condition],
  });
});

test('compileWithRspack takes precedence over automatic externalization', () => {
  const config = unwrapConfigFragment(
    compileWithRspack(['false-positive-package'])
  );

  assert.deepEqual(
    config[NATIVE_ADDON_EXTERNALIZATION_CONFIG].forceBundle,
    ['false-positive-package']
  );
  assert.equal(config.module.rules[0].include.length, 1);
});

test('composes compile and explicit native addon configuration fragments', () => {
  const config = {
    ...compileWithRspack(['compiled-package']),
    ...configureNativeAddonExternalization({
      forceBundle: ['custom-loader-package'],
    }),
  };

  mergeMeteorRspackFragments(config);
  assert.deepEqual(
    consumeNativeAddonExternalizationConfig(config),
    {
      enabled: true,
      forceBundle: ['compiled-package', 'custom-loader-package'],
    }
  );
  assert.equal(NATIVE_ADDON_EXTERNALIZATION_CONFIG in config, false);
});

test('consumes internal options with override precedence', () => {
  const userConfig = {
    [NATIVE_ADDON_EXTERNALIZATION_CONFIG]: {
      enabled: false,
      forceBundle: ['user-package'],
    },
  };
  const overrideConfig = {
    [NATIVE_ADDON_EXTERNALIZATION_CONFIG]: {
      enabled: true,
      forceBundle: ['override-package'],
    },
  };

  assert.deepEqual(
    consumeNativeAddonExternalizationConfig(userConfig, overrideConfig),
    {
      enabled: true,
      forceBundle: ['user-package', 'override-package'],
    }
  );
  assert.equal(NATIVE_ADDON_EXTERNALIZATION_CONFIG in userConfig, false);
  assert.equal(NATIVE_ADDON_EXTERNALIZATION_CONFIG in overrideConfig, false);
});

test('validates native addon externalization options', () => {
  assert.throws(
    () => configureNativeAddonExternalization(null),
    /options must be an object/
  );
  assert.throws(
    () => configureNativeAddonExternalization({ enabled: 'yes' }),
    /enabled must be a boolean/
  );
  assert.throws(
    () => configureNativeAddonExternalization({ forceBundle: 'package' }),
    /forceBundle must be an array/
  );
  assert.throws(
    () => configureNativeAddonExternalization({ forceBundle: [42] }),
    /entries must be strings, regular expressions, or functions/
  );
  assert.throws(
    () => configureNativeAddonExternalization({ disabled: true }),
    /unknown option "disabled"/
  );
});
