import { Accounts } from 'meteor/accounts-base';
import { DDP } from 'meteor/ddp-client';
import { DDPCommon } from 'meteor/ddp-common';
import * as OTPAuth from 'otpauth';
import { Random } from 'meteor/random';

const findUserById =
  async id => await Meteor.users.findOneAsync(id);

const insertUser = async (fields = {}) =>
  Accounts.insertUserDoc(
    {},
    {
      emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }],
      ...fields,
    }
  );

const callAs = (userId, name, ...args) => {
  const method = Meteor.server.method_handlers[name];
  const invocation = new DDPCommon.MethodInvocation({
    userId,
    isSimulation: false,
    setUserId: () => {},
    unblock: () => {},
    connection: { id: 'conn', close() {} },
    randomSeed: Random.id(),
  });
  return DDP._CurrentMethodInvocation.withValue(invocation, () =>
    method.apply(invocation, args)
  );
};

const refuseChange = () =>
  Accounts.validate2faChange(() => {
    throw new Meteor.Error('2fa-change-refused', 'change refused');
  });

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
  const guard = refuseChange();
  try {
    const userId = await insertUser();
    try {
      await callAs(userId, 'generate2faActivationQrCode', 'Test app');
      test.fail('the activation should have been refused');
    } catch (error) {
      test.equal(error.error, '2fa-change-refused');
    }
    const user = await findUserById(userId);
    test.isFalse(!!user.services?.twoFactorAuthentication?.secret);
  } finally {
    guard.stop();
  }
});

Tinytest.addAsync('account - 2fa - validate2faChange can refuse enabling 2FA', async test => {
  const guard = refuseChange();
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  try {
    const userId = await insertUser({
      services: { twoFactorAuthentication: { secret } },
    });
    const { token } = Accounts._generate2faToken(secret);
    try {
      await callAs(userId, 'enableUser2fa', token);
      test.fail('enabling 2FA should have been refused');
    } catch (error) {
      test.equal(error.error, '2fa-change-refused');
    }
    const user = await findUserById(userId);
    test.equal(user.services.twoFactorAuthentication.secret, secret);
    test.isFalse(!!user.services.twoFactorAuthentication.type);
  } finally {
    guard.stop();
  }
});

Tinytest.addAsync('account - 2fa - validate2faChange can refuse disabling 2FA', async test => {
  const guard = refuseChange();
  const secret = 'jbswy3dpehpk3pxp';
  try {
    const userId = await insertUser({
      services: { twoFactorAuthentication: { type: 'otp', secret } },
    });
    try {
      await callAs(userId, 'disableUser2fa');
      test.fail('disabling 2FA should have been refused');
    } catch (error) {
      test.equal(error.error, '2fa-change-refused');
    }
    const user = await findUserById(userId);
    test.equal(user.services.twoFactorAuthentication.secret, secret);
  } finally {
    guard.stop();
  }
});

Tinytest.addAsync('account - 2fa - validate2faChange stop lets the same call succeed', async test => {
  const guard = refuseChange();
  try {
    const userId = await insertUser();
    try {
      await callAs(userId, 'generate2faActivationQrCode', 'Test app');
      test.fail('the activation should have been refused');
    } catch (error) {
      test.equal(error.error, '2fa-change-refused');
    }
    guard.stop();
    const { secret } = await callAs(userId, 'generate2faActivationQrCode', 'Test app');
    const user = await findUserById(userId);
    test.equal(user.services.twoFactorAuthentication.secret, secret);
  } finally {
    guard.stop();
  }
});

Tinytest.addAsync('account - 2fa - validate2faChange receives the change payload', async test => {
  const seen = [];
  const guard = Accounts.validate2faChange(payload => {
    seen.push(payload);
  });
  const userId = await insertUser();
  try {
    const { secret } = await callAs(userId, 'generate2faActivationQrCode', 'Test app');
    const { token } = Accounts._generate2faToken(secret);
    await callAs(userId, 'enableUser2fa', token);
    await callAs(userId, 'disableUser2fa');
  } finally {
    guard.stop();
  }
  test.equal(seen.map(({ type, stage }) => ({ type, stage })), [
    { type: 'activation', stage: 'setup' },
    { type: 'activation', stage: 'confirm' },
    { type: 'deactivation', stage: undefined },
  ]);
  seen.forEach(payload => {
    test.equal(payload.user._id, userId);
    test.equal(payload.connection.id, 'conn');
  });
});
