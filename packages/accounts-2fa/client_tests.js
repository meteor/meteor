import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';

Tinytest.add('account - 2fa - has2faEnabled', test => {
  const userId = Accounts.createUser({
    username: Random.id(),
    password: Random.id(),
  });

  Accounts.has2faEnabled(userId, (error, result) => {
    test.equal(result, false);
  });
});
