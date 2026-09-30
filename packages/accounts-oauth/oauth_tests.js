import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp-client';
import { Random } from 'meteor/random';
import { ServiceConfiguration } from 'meteor/service-configuration';

// XXX Add a test to ensure that successful logins call Accounts.updateOrCreateUserFromExternalService
// XXX Add a test to ensure that a missing or failed loginResult is handled correctly

const testService = 'configure-login-service-test';
const { configurations } = ServiceConfiguration;

const withUnconfiguredService = async fn => {
  Accounts.oauth.registerService(testService);
  await configurations.removeAsync({ service: testService });
  try {
    await fn();
  } finally {
    Accounts.oauth.unregisterService(testService);
    await configurations.removeAsync({ service: testService });
  }
};

// `meteor test-packages` always runs in development mode, so production is
// simulated by overriding `Meteor.isDevelopment` while `fn` runs.
const withEnvironment = async (
  { isDevelopment, allowClientServiceConfiguration },
  fn
) => {
  const originalIsDevelopment = Meteor.isDevelopment;
  const hadOption =
    Object.hasOwn(Accounts._options, 'allowClientServiceConfiguration');
  const originalOption = Accounts._options.allowClientServiceConfiguration;
  const setOption = (isSet, value) => {
    if (isSet) {
      Accounts._options.allowClientServiceConfiguration = value;
    } else {
      delete Accounts._options.allowClientServiceConfiguration;
    }
  };

  Meteor.isDevelopment = isDevelopment;
  setOption(
    allowClientServiceConfiguration !== undefined,
    allowClientServiceConfiguration
  );
  try {
    await fn();
  } finally {
    Meteor.isDevelopment = originalIsDevelopment;
    setOption(hadOption, originalOption);
  }
};

const configureFromClient = async (configuration, resumeToken) => {
  const connection = DDP.connect(Meteor.absoluteUrl());
  try {
    if (resumeToken) {
      await connection.callAsync('login', { resume: resumeToken });
    }
    await connection.callAsync('configureLoginService', configuration);
    return null;
  } catch (error) {
    return error;
  } finally {
    connection.disconnect();
  }
};

const attackerConfiguration = {
  service: testService,
  clientId: 'attacker-client-id',
  secret: 'attacker-secret',
  loginStyle: 'popup',
};

const createLoggedInUser = async () => {
  const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
  const stampedToken = Accounts._generateStampedLoginToken();
  await Accounts._insertLoginToken(userId, stampedToken);
  return stampedToken.token;
};

Tinytest.addAsync(
  'accounts-oauth - configureLoginService - rejects clients in production',
  test => withUnconfiguredService(() => withEnvironment(
    { isDevelopment: false },
    async () => {
      const anonymousError = await configureFromClient(attackerConfiguration);
      test.instanceOf(anonymousError, Meteor.Error, 'anonymous call accepted');
      test.equal(anonymousError?.error, 403);

      const userError = await configureFromClient(
        attackerConfiguration,
        await createLoggedInUser()
      );
      test.instanceOf(userError, Meteor.Error, 'logged-in call accepted');
      test.equal(userError?.error, 403);

      const stored =
        await configurations.findOneAsync({ service: testService });
      test.isFalse(stored, `client stored ${JSON.stringify(stored)}`);

      await configurations.upsertAsync(
        { service: testService },
        { $set: { clientId: 'owner-client-id', secret: 'owner-secret' } }
      );
      const configuration =
        await configurations.findOneAsync({ service: testService });
      test.equal(configuration.clientId, 'owner-client-id');
      test.equal(configuration.secret, 'owner-secret');
    }
  ))
);

Tinytest.addAsync(
  'accounts-oauth - configureLoginService - server calls work in production',
  test => withUnconfiguredService(() => withEnvironment(
    { isDevelopment: false },
    async () => {
      await Meteor.callAsync('configureLoginService', {
        service: testService,
        clientId: 'owner-client-id',
        secret: 'owner-secret',
      });
      const configuration =
        await configurations.findOneAsync({ service: testService });
      test.equal(configuration.clientId, 'owner-client-id');
    }
  ))
);

Tinytest.addAsync(
  'accounts-oauth - configureLoginService - allowed in development',
  test => withUnconfiguredService(() => withEnvironment(
    { isDevelopment: true },
    async () => {
      const unknownError = await configureFromClient({
        ...attackerConfiguration,
        service: 'not-a-registered-service',
      });
      test.equal(unknownError?.error, 403);
      test.equal(unknownError?.reason, 'Service unknown');

      test.isNull(await configureFromClient(attackerConfiguration));
      const configuration =
        await configurations.findOneAsync({ service: testService });
      test.equal(configuration.clientId, attackerConfiguration.clientId);

      const secondError = await configureFromClient({
        ...attackerConfiguration,
        clientId: 'other-client-id',
      });
      test.equal(secondError?.error, 403);
      test.equal(
        (await configurations.findOneAsync({ service: testService })).clientId,
        attackerConfiguration.clientId
      );
    }
  ))
);

Tinytest.addAsync(
  'accounts-oauth - configureLoginService - allowClientServiceConfiguration',
  async test => {
    await withUnconfiguredService(() => withEnvironment(
      { isDevelopment: true, allowClientServiceConfiguration: false },
      async () => {
        const error = await configureFromClient(attackerConfiguration);
        test.equal(error?.error, 403);
        const stored =
          await configurations.findOneAsync({ service: testService });
        test.isFalse(stored, `client stored ${JSON.stringify(stored)}`);
      }
    ));

    await withUnconfiguredService(() => withEnvironment(
      { isDevelopment: false, allowClientServiceConfiguration: true },
      async () => {
        test.isNull(await configureFromClient(attackerConfiguration));
        const configuration =
          await configurations.findOneAsync({ service: testService });
        test.equal(configuration.clientId, attackerConfiguration.clientId);
      }
    ));
  }
);
