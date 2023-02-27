import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';

const findUserById = id => Meteor.users.findOne(id);

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

  test.equal(Accounts._check2faEnabled(findUserById(userWithout2FA)), false);
  test.equal(Accounts._check2faEnabled(findUserById(userWith2FA)), true);

  // cleanup
  Accounts.users.remove(userWithout2FA);
  Accounts.users.remove(userWith2FA);
});
