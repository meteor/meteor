import { Accounts } from 'meteor/accounts-base';
import { Hook } from 'meteor/callback-hook';
import { Random } from 'meteor/random';

Tinytest.addAsync('accounts - after-create hooks complete in order', async test => {
  const accounts = Object.create(Accounts);
  accounts.afterCreateUserHook = new Hook({ bindEnvironment: false });
  const id = await accounts.users.insertAsync({ username: Random.id() });
  const calls = [];
  accounts.afterCreateUserHook.register(async user => {
    await Promise.resolve();
    calls.push(user._id);
  });
  accounts.afterCreateUserHook.register(() => { calls.push('second'); });
  try {
    await accounts._finishUserCreation(id);
    test.equal(calls, [id, 'second']);
  } finally {
    await accounts.users.removeAsync(id);
  }
});

Tinytest.addAsync('accounts - after-create hook failure retains the account', async test => {
  const accounts = Object.create(Accounts);
  accounts.afterCreateUserHook = new Hook({ bindEnvironment: false });
  const id = await accounts.users.insertAsync({ username: Random.id() });
  accounts.afterCreateUserHook.register(async () => { throw new Error('hook failed'); });
  try {
    await test.throwsAsync(() => accounts._finishUserCreation(id), /hook failed/);
    test.isTrue(!!await accounts.users.findOneAsync(id));
  } finally {
    await accounts.users.removeAsync(id);
  }
});

Tinytest.addAsync('accounts - public password signup rejects role options', async test => {
  const loginMethod = Accounts._loginMethod;
  Accounts._loginMethod = async (_context, _name, _args, _type, action) => action();
  try {
    for (const options of [{ role: 'admin' }, { scope: 'tenant' }]) {
      await test.throwsAsync(() => Meteor.server.method_handlers.createUser.call({}, {
        username: Random.id(), ...options,
      }), /Roles can only be assigned by the server/);
    }
  } finally {
    Accounts._loginMethod = loginMethod;
  }
});
