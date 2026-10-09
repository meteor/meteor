import { Accounts } from 'meteor/accounts-base';
import { Match } from 'meteor/check';
import * as OTPAuth from 'otpauth';
import { Random } from 'meteor/random';
import crypto from 'crypto';

const findUserById = id => Meteor.users.findOneAsync(id);

const createUser = async (extra = {}) =>
  Accounts.insertUserDoc(
    {},
    {
      emails: [{ address: `${Random.id()}@meteorapp.com`, verified: true }],
      ...extra,
    }
  );

const restorePolicy = () => {
  delete Accounts._options.require2fa;
  Accounts.configure2fa({
    email: {
      enabled: false,
      expirationMs: 10 * 60 * 1000,
      maxAttempts: 5,
      resendCooldownMs: 60 * 1000,
      requireVerified: true,
      offerToOtpUsers: false,
      hashSecret: null,
    },
  });
  Accounts._2faTestState = {};
};

const otpUserFields = () => ({
  services: {
    twoFactorAuthentication: {
      type: 'otp',
      secret: new OTPAuth.Secret({ size: 20 }).base32,
    },
  },
});

Tinytest.addAsync('account - 2fa - email code goes to the first verified address', async test => {
  const unverified = `${Random.id()}@meteorapp.com`;
  const firstVerified = `${Random.id()}@meteorapp.com`;
  const secondVerified = `${Random.id()}@meteorapp.com`;
  const userId = await createUser({
    emails: [
      { address: unverified, verified: false },
      { address: firstVerified, verified: true },
      { address: secondVerified, verified: true },
    ],
  });
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    const issued = await Accounts._issue2faEmailCode(await findUserById(userId));
    test.isTrue(issued.sent);
    const stored = await findUserById(userId);
    test.equal(stored.services.twoFactorAuthentication.emailCode.email, firstVerified);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.add('account - 2fa - hashSecret may be omitted', () => {
  try {
    Accounts.configure2fa({ email: { enabled: true, hashSecret: undefined } });
    Accounts.configure2fa({ email: { enabled: true, hashSecret: null } });
  } finally {
    restorePolicy();
  }
});

Tinytest.addAsync('account - 2fa - email off keeps the historical TOTP-only policy', async test => {
  const plainId = await createUser();
  const otpId = await createUser(otpUserFields());
  try {
    restorePolicy();
    const plain = await findUserById(plainId);
    const otp = await findUserById(otpId);

    const plainDecision = await Accounts._is2faRequired(plain, { loginMethod: 'password' });
    test.isFalse(plainDecision.required);

    const missing = await Accounts._enforce2faOnLogin({
      user: otp,
      context: { loginMethod: 'password' },
    });
    test.equal(missing.error, 'no-2fa-code');
    test.equal(missing.details.methods, ['otp']);
    test.isFalse(missing.details.emailSent);

    const secret = otp.services.twoFactorAuthentication.secret;
    const { token } = Accounts._generate2faToken(secret);
    const accepted = await Accounts._enforce2faOnLogin({
      user: otp,
      code: token,
      context: { loginMethod: 'password' },
    });
    test.isUndefined(accepted);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(plainId);
    await Accounts.users.removeAsync(otpId);
  }
});

Tinytest.addAsync('account - 2fa - email is sent only when TOTP is not set up', async test => {
  const plainId = await createUser();
  const otpId = await createUser(otpUserFields());
  try {
    Accounts.configure2fa({ email: { enabled: true } });

    const plainChallenge = await Accounts._enforce2faOnLogin({
      user: await findUserById(plainId),
      context: { loginMethod: 'password' },
    });
    test.equal(plainChallenge.error, 'no-2fa-code');
    test.equal(plainChallenge.details.methods, ['email']);
    test.isTrue(plainChallenge.details.emailSent);
    const emailedCode = Accounts._2faTestState.lastEmailCode;
    test.equal(emailedCode.length, 6);

    const otpChallenge = await Accounts._enforce2faOnLogin({
      user: await findUserById(otpId),
      context: { loginMethod: 'password' },
    });
    test.equal(otpChallenge.details.methods, ['otp']);
    test.isFalse(otpChallenge.details.emailSent);

    Accounts._2faTestState = {};
    const requested = await Accounts._enforce2faOnLogin({
      user: await findUserById(otpId),
      method: 'email',
      context: { loginMethod: 'password' },
    });
    test.equal(requested.error, '2fa-method-unavailable');
    test.isUndefined(Accounts._2faTestState.lastEmailCode);

    const cooledDown = await Accounts._enforce2faOnLogin({
      user: await findUserById(plainId),
      context: { loginMethod: 'password' },
    });
    test.isFalse(cooledDown.details.emailSent);
    test.isTrue(cooledDown.details.retryAfterMs > 0);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(plainId);
    await Accounts.users.removeAsync(otpId);
  }
});

Tinytest.addAsync('account - 2fa - parallel logins send a single email', async test => {
  const userId = await createUser();
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    const user = await findUserById(userId);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => Accounts._issue2faEmailCode(user))
    );
    test.equal(results.filter(result => result.sent).length, 1);
    test.isTrue(results.every(result => result.sent || result.retryAfterMs > 0));
    const stored = await findUserById(userId);
    test.equal(stored.services.twoFactorAuthentication.emailCode.attempts, 0);
    test.isTrue(!!stored.services.twoFactorAuthentication.emailCode.hash);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - email code is single use, expires, and locks out', async test => {
  const userId = await createUser();
  try {
    Accounts.configure2fa({ email: { enabled: true, maxAttempts: 5, expirationMs: 10 * 60 * 1000 } });
    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    const code = Accounts._2faTestState.lastEmailCode;

    const accepted = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      code,
      context: { loginMethod: 'password' },
    });
    test.isUndefined(accepted);

    const replay = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      code,
      context: { loginMethod: 'password' },
    });
    test.equal(replay.error, 'invalid-2fa-code');

    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    const secondCode = Accounts._2faTestState.lastEmailCode;
    await Meteor.users.updateAsync(userId, {
      $set: {
        'services.twoFactorAuthentication.emailCode.createdAt': new Date(Date.now() - 11 * 60 * 1000),
      },
    });
    const expired = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      code: secondCode,
      context: { loginMethod: 'password' },
    });
    test.equal(expired.error, 'invalid-2fa-code');

    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await Accounts._enforce2faOnLogin({
        user: await findUserById(userId),
        code: '000000',
        context: { loginMethod: 'password' },
      });
      test.equal(wrong.error, 'invalid-2fa-code');
    }
    const user = await findUserById(userId);
    const spent = user.services?.twoFactorAuthentication?.emailCode;
    test.isFalse(!!spent?.hash);
    test.equal(spent.attempts, 5);
    const resent = await Accounts._enforce2faOnLogin({
      user,
      context: { loginMethod: 'password' },
    });
    test.isFalse(resent.details.emailSent);
    test.isTrue(resent.details.retryAfterMs > 0);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - validate2faChallenge can refuse the email', async test => {
  const userId = await createUser();
  const stop = Accounts.validate2faChallenge(() => {
    throw new Meteor.Error(403, 'accountLocked');
  });
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    Accounts._2faTestState = {};
    const refused = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    test.equal(refused.error, 403);
    test.equal(refused.reason, 'accountLocked');
    test.isFalse(!!Accounts._2faTestState.lastEmailCode);
    const user = await findUserById(userId);
    test.isFalse(!!user.services?.twoFactorAuthentication?.emailCode);
  } finally {
    stop.stop();
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - on2faVerified runs only after the login is accepted', async test => {
  const userId = await createUser();
  let seen = 0;
  const stop = Accounts.on2faVerified(() => {
    seen += 1;
  });
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    const code = Accounts._2faTestState.lastEmailCode;
    const accepted = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      code,
      context: { loginMethod: 'password', connection: { id: 'conn' } },
    });
    test.isUndefined(accepted);
    test.equal(seen, 0);

    const user = await findUserById(userId);
    await Accounts._successfulLogin({ id: 'other' }, {
      type: 'resume',
      allowed: true,
      user,
    });
    test.equal(seen, 0);

    await Accounts._successfulLogin({ id: 'conn' }, {
      type: 'password',
      allowed: true,
      user,
    });
    test.equal(seen, 1);
  } finally {
    stop.stop();
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - a too-long code is rejected before it is hashed', async test => {
  const userId = await createUser();
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    const before = await findUserById(userId);
    const refused = await Accounts._enforce2faOnLogin({
      user: before,
      code: '1'.repeat(17),
      context: { loginMethod: 'password' },
    });
    test.equal(refused.error, 'invalid-2fa-code');
    const after = await findUserById(userId);
    test.equal(after.services.twoFactorAuthentication.emailCode.attempts, 0);
    test.equal(
      after.services.twoFactorAuthentication.emailCode.hash,
      before.services.twoFactorAuthentication.emailCode.hash
    );
    test.isTrue(Match.test('123456', Accounts._2faCodeMatch));
    test.isFalse(Match.test('1'.repeat(17), Accounts._2faCodeMatch));
    test.isFalse(Match.test('', Accounts._2faCodeMatch));
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - require2fa callback can read the client context and fails closed', async test => {
  const userId = await createUser();
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    Accounts.config({
      async require2fa(id, context) {
        test.equal(id, userId);
        return context.clientContext?.trusted !== 'yes';
      },
    });

    const skipped = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: {
        loginMethod: 'password',
        clientContext: { trusted: 'yes' },
      },
    });
    test.isUndefined(skipped);

    Accounts.config({
      require2fa() {
        throw new Error('policy down');
      },
    });
    const forced = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password', clientContext: { trusted: 'yes' } },
    });
    test.equal(forced.error, 'no-2fa-code');
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - passwordless login cannot use the email factor', async test => {
  const userId = await createUser();
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    Accounts.config({ require2fa: true });
    const result = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'passwordless' },
    });
    test.equal(result.error, '2fa-method-unavailable');
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - an old client code matches TOTP, then a pending email code', async test => {
  const userId = await createUser(otpUserFields());
  try {
    Accounts.configure2fa({ email: { enabled: true, offerToOtpUsers: true, resendCooldownMs: 0 } });
    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      method: 'email',
      context: { loginMethod: 'password' },
    });
    const emailCode = Accounts._2faTestState.lastEmailCode;
    const user = await findUserById(userId);
    const { token } = Accounts._generate2faToken(user.services.twoFactorAuthentication.secret);

    const byTotp = await Accounts._enforce2faOnLogin({
      user,
      code: token,
      context: { loginMethod: 'password' },
    });
    test.isUndefined(byTotp);

    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      method: 'email',
      context: { loginMethod: 'password' },
    });
    const withoutMethod = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      code: Accounts._2faTestState.lastEmailCode,
      context: { loginMethod: 'password' },
    });
    test.isUndefined(withoutMethod);
    test.equal(emailCode.length, 6);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - email hashSecret changes the stored hash', async test => {
  const userId = await createUser();
  try {
    Accounts.configure2fa({ email: { enabled: true, hashSecret: 'server-secret' } });
    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    const code = Accounts._2faTestState.lastEmailCode;
    const stored = (await findUserById(userId)).services.twoFactorAuthentication.emailCode.hash;
    const plain = crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
    test.notEqual(stored, plain);

    const verified = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      code,
      method: 'email',
      context: { loginMethod: 'password' },
    });
    test.isUndefined(verified);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - email is not offered to a TOTP user unless the app opts in', async test => {
  const userId = await createUser(otpUserFields());
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    const result = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      method: 'email',
      context: { loginMethod: 'password' },
    });
    test.equal(result.error, '2fa-method-unavailable');
    test.isUndefined(Accounts._2faTestState.lastEmailCode);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - enabling email does not lock out users with no factor', async test => {
  const userId = await createUser({
    emails: [{ address: `${Random.id()}@meteorapp.com`, verified: false }],
  });
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    const result = await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    test.isUndefined(result);
  } finally {
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - on2faVerified only runs for the connection that passed', async test => {
  const userId = await createUser();
  let seen = 0;
  const stop = Accounts.on2faVerified(() => {
    seen += 1;
  });
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      context: { loginMethod: 'password' },
    });
    await Accounts._enforce2faOnLogin({
      user: await findUserById(userId),
      code: Accounts._2faTestState.lastEmailCode,
      context: { loginMethod: 'password', connection: { id: 'browser-a' } },
    });
    await Accounts._successfulLogin({ id: 'browser-b' }, {
      type: 'password',
      allowed: true,
      user: await findUserById(userId),
    });
    test.equal(seen, 0);
  } finally {
    stop.stop();
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - a null context value does not break the login', async test => {
  const username = Random.id();
  const userId = await Accounts.createUserAsync({ username, password: 'pw-123456' });
  try {
    const result = await Accounts._runLoginHandlers(
      { connection: { id: Random.id(), close() {} }, setUserId() {} },
      { user: { username }, password: 'pw-123456', twoFactorContext: { trustedDeviceToken: null } }
    );
    test.isUndefined(result.error);
    test.equal(result.userId, userId);
  } finally {
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - TOTP-only apps see the same failed attempt as before', async test => {
  restorePolicy();
  const username = Random.id();
  const userId = await Accounts.createUserAsync({ username, password: 'pw-123456' });
  await Meteor.users.updateAsync(userId, {
    $set: { 'services.twoFactorAuthentication': otpUserFields().services.twoFactorAuthentication },
  });
  let failedUser = 'not-called';
  const stop = Accounts.onLoginFailure(attempt => {
    failedUser = attempt.user;
  });
  const invocation = { connection: { id: Random.id(), close() {} }, setUserId() {} };
  const options = { user: { username }, password: 'pw-123456' };
  try {
    const result = await Accounts._runLoginHandlers(invocation, options);
    await Accounts._attemptLogin(invocation, 'login', [options], result).catch(() => {});
    test.isUndefined(failedUser);
  } finally {
    stop.stop();
    await Accounts.users.removeAsync(userId);
  }
});

Tinytest.addAsync('account - 2fa - a failed send does not block the next one', async test => {
  const { Email } = Package.email;
  const previous = Email.customTransport;
  const userId = await createUser();
  try {
    Accounts.configure2fa({ email: { enabled: true } });
    Email.customTransport = () => {
      throw new Error('smtp down');
    };
    await Accounts._issue2faEmailCode(await findUserById(userId)).catch(() => {});
    Email.customTransport = () => {};
    const retry = await Accounts._issue2faEmailCode(await findUserById(userId));
    test.isTrue(retry.sent);
  } finally {
    Email.customTransport = previous;
    restorePolicy();
    await Accounts.users.removeAsync(userId);
  }
});
