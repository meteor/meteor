import { Accounts } from 'meteor/accounts-base';
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
    test.equal(otpChallenge.details.methods, ['otp', 'email']);
    test.isFalse(otpChallenge.details.emailSent);

    const requested = await Accounts._enforce2faOnLogin({
      user: await findUserById(otpId),
      method: 'email',
      context: { loginMethod: 'password' },
    });
    test.isTrue(requested.details.emailSent);

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
    test.isFalse(!!user.services?.twoFactorAuthentication?.emailCode);
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
    Accounts.configure2fa({ email: { enabled: true, resendCooldownMs: 0 } });
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
