import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';

Tinytest.add('account - 2fa - has2faEnabled', test => {
  // Create users
  const userWithout2FA = Accounts.insertUserDoc({}, { emails: [{address: `${Random.id()}@meteorapp.com`, verified: true}] });
  const userWith2FA = Accounts.insertUserDoc({}, { emails: [{address: `${Random.id()}@meteorapp.com`, verified: true}], services: { twoFactorAuthentication: { type: 'otp', secret: 'superSecret' } } });

  test.equal(Accounts._is2faEnabledForUser(userWithout2FA), false);
  test.equal(Accounts._is2faEnabledForUser(userWith2FA), true);

  // cleanup
  Accounts.users.remove(userWithout2FA);
  Accounts.users.remove(userWith2FA);
});
