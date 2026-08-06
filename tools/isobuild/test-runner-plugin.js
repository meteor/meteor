const TEST_RUNNER_FEATURE = 'isobuild:test-runner-plugin';
const TEST_RUNNER_API_VERSION = 1;

function report(buildmessage, message) {
  buildmessage.error(`Plugin.registerTestRunner: ${message}`, {
    useMyCaller: 3,
  });
}

function createRegisterTestRunner({ isopack, buildmessage }) {
  return function registerTestRunner(registration, factory) {
    if (!isopack.featureEnabled(TEST_RUNNER_FEATURE)) {
      buildmessage.error(
        `your package must \`api.use('${TEST_RUNNER_FEATURE}@1.0.0')\` in ` +
          'order for its plugins to call Plugin.registerTestRunner'
      );
      return;
    }

    if (!registration || typeof registration !== 'object') {
      report(buildmessage, 'must specify a registration object');
      return;
    }

    const { id, apiVersion, activationPackages } = registration;
    if (typeof id !== 'string' || id.length === 0) {
      report(buildmessage, 'must specify a non-empty id');
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
      report(buildmessage, 'id must use lowercase letters, numbers, dots, underscores, or dashes');
      return;
    }
    if (apiVersion !== TEST_RUNNER_API_VERSION) {
      report(buildmessage, `must specify apiVersion ${TEST_RUNNER_API_VERSION}`);
      return;
    }
    if (!Array.isArray(activationPackages) || activationPackages.length === 0 ||
        activationPackages.some(name => typeof name !== 'string' || name.length === 0)) {
      report(buildmessage, 'must specify non-empty activationPackages');
      return;
    }
    if (typeof factory !== 'function') {
      report(buildmessage, 'must specify a factory function');
      return;
    }
    if (isopack.testRunnerProviders.some(
      provider => provider.registration.id === id
    )) {
      report(buildmessage, `provider id "${id}" is already registered by this package`);
      return;
    }

    const frozenRegistration = Object.freeze({
      id,
      apiVersion,
      activationPackages: Object.freeze([...new Set(activationPackages)]),
    });
    isopack.testRunnerProviders.push(Object.freeze({
      registration: frozenRegistration,
      factory,
    }));
  };
}

module.exports = {
  TEST_RUNNER_API_VERSION,
  TEST_RUNNER_FEATURE,
  createRegisterTestRunner,
};
