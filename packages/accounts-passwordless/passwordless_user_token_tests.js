import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import {
  insertUser,
  loginWithToken,
  requestLoginTokens,
} from './passwordless_test_helpers';

const isError = code => error => error?.error === code;

const newEmail = () => `${Random.id()}@example.com`.toLowerCase();

const newTwoFactorSecret = () =>
  Array.from({ length: 32 }, () =>
    Random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')
  ).join('');

const assertLoginRequires2fa = async (
  test,
  { userId, selector, token, secret }
) => {
  await test.throwsAsync(
    () => loginWithToken({ selector, token }),
    isError('no-2fa-code'),
    'login without a 2FA code'
  );
  await test.throwsAsync(
    () => loginWithToken({ selector, token, code: 'not-a-code' }),
    isError('invalid-2fa-code'),
    'login with an invalid 2FA code'
  );

  const { token: code } = Accounts._generate2faToken(secret);
  const login = await loginWithToken({ selector, token, code });
  test.equal(login.id, userId);
};

Tinytest.addAsync(
  'passwordless - email code logs in once and verifies the address',
  async test => {
    const email = newEmail();
    const userId = await insertUser(email);
    try {
      const { emailToken } = await requestLoginTokens(email);
      const selector = { email };

      const login = await loginWithToken({ selector, token: emailToken });
      test.equal(login.id, userId);
      await test.throwsAsync(
        () => loginWithToken({ selector, token: emailToken }),
        isError(403),
        'second use of the email code'
      );

      const user = await Meteor.users.findOneAsync(userId);
      test.isTrue(user.emails[0].verified);
      test.isUndefined(user.services.passwordless);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  }
);

Tinytest.addAsync(
  'passwordless - user-level token can only be used once',
  async test => {
    const email = newEmail();
    const userId = await insertUser(email);
    try {
      const { userToken } = await requestLoginTokens(email);
      const selector = { id: userId };

      const login = await loginWithToken({ selector, token: userToken });
      test.equal(login.id, userId);
      await test.throwsAsync(
        () => loginWithToken({ selector, token: userToken }),
        isError(403),
        'second use of the user-level token'
      );

      const user = await Meteor.users.findOneAsync(userId);
      test.isUndefined(user.services.passwordless);
      test.isFalse(user.emails[0].verified);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  }
);

Tinytest.addAsync(
  'passwordless - user-level token requires 2FA like the email code',
  async test => {
    const email = newEmail();
    const secret = newTwoFactorSecret();
    const userId = await insertUser(email, {
      twoFactorAuthentication: { type: 'otp', secret },
    });
    try {
      const { emailToken } = await requestLoginTokens(email);
      await assertLoginRequires2fa(test, {
        userId,
        secret,
        selector: { email },
        token: emailToken,
      });

      const { userToken } = await requestLoginTokens(email);
      await assertLoginRequires2fa(test, {
        userId,
        secret,
        selector: { id: userId },
        token: userToken,
      });
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  }
);
