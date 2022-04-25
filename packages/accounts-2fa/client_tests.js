import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';

Tinytest.addAsync('account - 2fa - has2faEnabled - client', (test, done) => {
  Accounts.createUser({
    username: Random.id(),
    password: Random.id(),
  });

  Accounts.has2faEnabled((error, result) => {
    test.isFalse(result);
    done();
  });
});
