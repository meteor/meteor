import { Random } from 'meteor/random';
import {
  insertUser,
  loginWithToken,
  requestLoginTokens,
} from './passwordless_test_helpers';

// The address is stored in lower case and typed with capitals both when
// requesting the code and when logging in (#12412).
Tinytest.addAsync(
  'passwordless - email code logs in when the address is typed in another case',
  async test => {
    const email = `${Random.id()}@example.com`.toLowerCase();
    const typedEmail = email.toUpperCase();
    const userId = await insertUser(email);
    try {
      const { emailToken } = await requestLoginTokens(typedEmail);
      const login = await loginWithToken({
        selector: { email: typedEmail },
        token: emailToken,
      });
      test.equal(login.id, userId);

      const user = await Meteor.users.findOneAsync(userId);
      test.equal(user.emails[0].address, email);
      test.isTrue(user.emails[0].verified);
      test.isUndefined(user.services.passwordless);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  }
);
