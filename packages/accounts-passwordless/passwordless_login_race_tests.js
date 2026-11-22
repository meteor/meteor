import { Random } from 'meteor/random';
import {
  insertUser,
  loginWithToken,
  requestLoginTokens,
} from './passwordless_test_helpers';

// Holds the login handler's user lookups for `email` until `count` of them
// have read the user, so those requests all race to consume the same token.
// `released` resolves to false if they could not be staged in time.
const holdUserLookups = (email, count) => {
  const findOneAsync = Meteor.users.findOneAsync;
  let lookups = 0;
  let release;
  const released = new Promise(resolve => {
    release = resolve;
  });
  const timeout = Meteor.setTimeout(() => release(false), 10000);

  Meteor.users.findOneAsync = async function (selector, ...args) {
    const user = await findOneAsync.call(this, selector, ...args);
    if (selector?.['emails.address'] === email) {
      lookups += 1;
      if (lookups === count) release(true);
      await released;
    }
    return user;
  };

  return {
    released,
    restore() {
      Meteor.clearTimeout(timeout);
      release(false);
      Meteor.users.findOneAsync = findOneAsync;
    },
  };
};

Tinytest.addAsync(
  'passwordless - concurrent logins with one email code create one session',
  async test => {
    const email = `${Random.id()}@example.com`.toLowerCase();
    const userId = await insertUser(email);
    try {
      const { emailToken } = await requestLoginTokens(email);
      const options = { selector: { email }, token: emailToken };

      const lookups = holdUserLookups(email, 2);
      let results;
      try {
        results = await Promise.allSettled([
          loginWithToken(options),
          loginWithToken(options),
        ]);
        test.isTrue(
          await lookups.released,
          'both logins read the token before either one consumed it'
        );
      } finally {
        lookups.restore();
      }

      const succeeded = results.filter(({ status }) => status === 'fulfilled');
      const failed = results.filter(({ status }) => status === 'rejected');
      test.equal(succeeded.length, 1, 'exactly one login succeeds');
      test.equal(failed.map(({ reason }) => reason.error), [403]);

      const user = await Meteor.users.findOneAsync(userId);
      test.equal(user.services.resume.loginTokens.length, 1);
      test.isTrue(user.emails[0].verified);
      test.isUndefined(user.services.passwordless);
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  }
);
