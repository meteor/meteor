import { Accounts } from 'meteor/accounts-base';
import { DDP } from 'meteor/ddp-client';
import { DDPCommon } from 'meteor/ddp-common';
import * as OTPAuth from 'otpauth';
import { Random } from 'meteor/random';
import crypto from 'crypto';

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

const restore2faConfig = () => {
  Accounts.configure2fa({
    window: 10,
    preventReplay: true,
    requireCodeToDisable: false,
    encryptionKey: null,
    allowPlaintextSecrets: true,
    rateLimit: { numRequests: 5, timeInterval: 60_000 },
  });
};

Tinytest.addAsync(
  'account - 2fa - encrypted secrets still validate and plaintext can be rejected',
  async test => {
    const key = crypto.randomBytes(32).toString('base64');
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const userId = await Accounts.insertUserDoc(
      {},
      {
        emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }],
        services: {
          twoFactorAuthentication: { type: 'otp', secret },
        },
      }
    );

    try {
      Accounts.configure2fa({
        encryptionKey: key,
        allowPlaintextSecrets: false,
      });

      test.equal(await Accounts.encryptExisting2faSecrets(), 1);
      const user = await findUserById(userId);
      const stored = user.services.twoFactorAuthentication.secret;
      test.isTrue(stored.startsWith('v1:'));

      const { token } = Accounts._generate2faToken(stored);
      test.isTrue(Accounts._isTokenValid(stored, token));
      test.isFalse(Accounts._isTokenValid(secret, token));

      Accounts.configure2fa({ encryptionKey: crypto.randomBytes(32).toString('base64') });
      test.isFalse(Accounts._isTokenValid(stored, token));
    } finally {
      restore2faConfig();
      await Accounts.users.removeAsync(userId);
    }
  }
);

Tinytest.addAsync(
  'account - 2fa - a login code cannot be replayed',
  async test => {
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const userId = await Accounts.insertUserDoc(
      {},
      {
        emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }],
        services: {
          twoFactorAuthentication: { type: 'otp', secret },
        },
      }
    );
    const { token } = Accounts._generate2faToken(secret);
    const invocation = {
      connection: {
        id: Random.id(),
        close() {},
      },
      setUserId() {},
    };
    const attempt = () =>
      Accounts._attemptLogin(
        invocation,
        'login',
        [{ user: { id: userId }, code: token }],
        { userId, type: 'password' }
      );

    try {
      const first = await attempt();
      test.equal(first.id, userId);

      let replayError = null;
      try {
        await attempt();
      } catch (error) {
        replayError = error;
      }
      test.equal(replayError && replayError.error, 'invalid-2fa-code');
    } finally {
      await Accounts.users.removeAsync(userId);
    }
  }
);

Tinytest.addAsync(
  'account - 2fa - an email factor does not consume a TOTP step',
  async test => {
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const userId = await Accounts.insertUserDoc(
      {},
      {
        emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }],
        services: {
          twoFactorAuthentication: { type: 'otp', secret },
        },
      }
    );
    const { token } = Accounts._generate2faToken(secret);
    const invocation = {
      connection: {
        id: Random.id(),
        close() {},
      },
      setUserId() {},
    };
    const previousFactor = Accounts._2faLoginFactor;
    Accounts._2faLoginFactor = () => 'email';
    const login = (code, twoFactorMethod) =>
      Accounts._attemptLogin(
        invocation,
        'login',
        [{ user: { id: userId }, code, ...(twoFactorMethod && { twoFactorMethod }) }],
        { userId, type: 'password' }
      );

    try {
      const byMethod = await login('000000', 'email');
      test.equal(byMethod.id, userId);
      const byFactor = await login('111111');
      test.equal(byFactor.id, userId);
      const user = await findUserById(userId);
      test.isFalse(Number.isInteger(user.services?.twoFactorAuthentication?.lastUsedStep));

      delete Accounts._2faLoginFactor;
      const totp = await login(token);
      test.equal(totp.id, userId);
    } finally {
      if (previousFactor) {
        Accounts._2faLoginFactor = previousFactor;
      } else {
        delete Accounts._2faLoginFactor;
      }
      await Accounts.users.removeAsync(userId);
    }
  }
);

Tinytest.addAsync('account - 2fa - reset2faForUser clears 2FA and notifies hooks', async test => {
  const userId = await Accounts.insertUserDoc(
    {},
    {
      emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }],
      services: {
        twoFactorAuthentication: { type: 'otp', secret: 'superSecret' },
      },
    }
  );
  let event = null;
  const hook = Accounts.on2faChange(payload => {
    event = payload;
  });

  try {
    await Accounts.reset2faForUser(userId, { connection: { id: 'conn' } });
    const user = await findUserById(userId);
    test.isFalse(Accounts._check2faEnabled(user));
    test.equal(event && event.event, 'reset');
    test.equal(event && event.userId, userId);
  } finally {
    hook.stop();
    await Accounts.users.removeAsync(userId);
  }
});
