import { Accounts } from 'meteor/accounts-base';
import { DDP } from 'meteor/ddp-client';
import { DDPCommon } from 'meteor/ddp-common';
import * as OTPAuth from 'otpauth';
import { Random } from 'meteor/random';
import './methods_tests.js';

const findUserById =
  async id => await Meteor.users.findOneAsync(id);

Tinytest.addAsync('account - 2fa - has2faEnabled - server', async test => {
  // Create users
  const userWithout2FA = await Accounts.insertUserDoc(
    {},
    { emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }] }
  );
  const userWith2FA = await Accounts.insertUserDoc(
    {},
    {
      emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }],
      services: {
        twoFactorAuthentication: { type: 'otp', secret: 'superSecret' },
      },
    }
  );

  test.equal(Accounts._check2faEnabled(await findUserById(userWithout2FA)), false);
  test.equal(Accounts._check2faEnabled(await findUserById(userWith2FA)), true);

  // cleanup
  await Accounts.users.removeAsync(userWithout2FA);
  await Accounts.users.removeAsync(userWith2FA);
});

Tinytest.add('account - 2fa - generated tokens validate against Base32 secrets', test => {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const { token } = Accounts._generate2faToken(secret);

  test.equal(token.length, 6);
  test.isTrue(/^[A-Z2-7]+$/.test(secret));
  test.isTrue(Accounts._isTokenValid(secret, token));
  test.isFalse(Accounts._isTokenValid(secret, '000000'));
});

Tinytest.add('account - 2fa - existing lowercase secrets remain valid', test => {
  const secret = 'jbswy3dpehpk3pxp';
  const { token } = Accounts._generate2faToken(secret);

  test.isTrue(Accounts._isTokenValid(secret, token));
});

Tinytest.addAsync('account - 2fa - validate2faChange can refuse an activation', async test => {
  const guard = Accounts.validate2faChange(() => {
    throw new Error('change-refused');
  });
  const userId = await Accounts.insertUserDoc(
    {},
    { emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }] }
  );
  const method = Meteor.server.method_handlers.generate2faActivationQrCode;
  const invocation = new DDPCommon.MethodInvocation({
    userId,
    isSimulation: false,
    setUserId: () => {},
    unblock: () => {},
    connection: { id: 'conn', close() {} },
    randomSeed: Random.id(),
  });
  try {
    await DDP._CurrentMethodInvocation.withValue(invocation, () =>
      method.apply(invocation, ['Test app'])
    );
    test.fail('the activation should have been refused');
  } catch (error) {
    test.equal(error.message, 'change-refused');
  } finally {
    guard.stop();
  }
  const user = await Meteor.users.findOneAsync(userId);
  test.isFalse(!!user.services?.twoFactorAuthentication?.secret);
});

Tinytest.addAsync('account - 2fa - a secret regenerated during activation stays inactive', async test => {
  const verifiedSecret = 'JBSWY3DPEHPK3PXP';
  const newSecret = 'KRUGS4ZANFZSAYJA';
  const userId = await Accounts.insertUserDoc(
    {},
    {
      emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }],
      services: { twoFactorAuthentication: { secret: verifiedSecret } },
    }
  );
  const guard = Accounts.validate2faChange(async ({ type }) => {
    if (type === 'activation') {
      await Meteor.users.updateAsync(userId, {
        $set: { 'services.twoFactorAuthentication': { secret: newSecret } },
      });
    }
  });
  const method = Meteor.server.method_handlers.enableUser2fa;
  const invocation = new DDPCommon.MethodInvocation({
    userId,
    isSimulation: false,
    setUserId: () => {},
    unblock: () => {},
    connection: { id: 'conn', close() {} },
    randomSeed: Random.id(),
  });
  const { token } = Accounts._generate2faToken(verifiedSecret);
  try {
    await DDP._CurrentMethodInvocation.withValue(invocation, () =>
      method.apply(invocation, [token])
    );
    test.fail('the activation should have been refused');
  } catch (error) {
    test.equal(error.error, 'invalid-2fa-code');
  } finally {
    guard.stop();
  }
  const user = await Meteor.users.findOneAsync(userId);
  test.equal(user.services.twoFactorAuthentication.secret, newSecret);
  test.isFalse(!!user.services.twoFactorAuthentication.type);
});
