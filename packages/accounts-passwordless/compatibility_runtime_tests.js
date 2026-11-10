import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import { insertUser, loginWithToken, requestLoginTokens } from './passwordless_test_helpers';

for (const scenario of ['hook versus hook', 'hook versus email']) {
  Tinytest.addAsync('compatibility - passwordless atomic ' + scenario, async test => {
    const email = Random.id().toLowerCase() + '@example.com';
    const userId = await insertUser(email);
    const originalFind = Meteor.users.findOneAsync;
    let timer;
    let release;
    try {
      const { userToken, emailToken } = await requestLoginTokens(email);
      const requests = [
        {selector: {id: userId}, token: userToken},
        scenario === 'hook versus hook'
          ? {selector: {id: userId}, token: userToken}
          : {selector: {email}, token: emailToken},
      ];
      let arrivals = 0;
      const barrier = new Promise(resolve => { release = resolve; });
      timer = setTimeout(() => release(false), 10000);
      Meteor.users.findOneAsync = async function(selector, options, ...rest) {
        const user = await originalFind.call(this, selector, options, ...rest);
        if ((selector?._id === userId || selector?.['emails.address'] === email) &&
            options?.fields?.services === 1 && options?.fields?.emails === 1) {
          if (++arrivals === 2) { clearTimeout(timer); release(true); }
          await barrier;
        }
        return user;
      };
      let outcomes;
      try { outcomes = await Promise.allSettled(requests.map(loginWithToken)); }
      finally { Meteor.users.findOneAsync = originalFind; clearTimeout(timer); release(false); }
      test.equal(arrivals, 2, 'both handlers read the same token snapshot');
      test.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1, 'one authenticated session');
      test.equal(outcomes.filter(x => x.status === 'rejected').map(x => x.reason.error), [403]);
      const user = await originalFind.call(Meteor.users, userId);
      test.equal(user.services.resume.loginTokens.length, 1);
      test.isUndefined(user.services.passwordless);
      if (scenario === 'hook versus hook') test.isFalse(user.emails[0].verified);
    } finally {
      Meteor.users.findOneAsync = originalFind; clearTimeout(timer); release?.(false);
      await Meteor.users.removeAsync(userId);
    }
  });
}
