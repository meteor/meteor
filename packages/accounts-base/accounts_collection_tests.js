import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { Tinytest } from 'meteor/tinytest';
import { waitForCollectionIndexes } from './accounts_collection_test_helpers.js';

for (const shared of [false, true]) {
  Tinytest.add(`accounts - collection change - secondary instance preserves Meteor.users (shared=${shared})`, test => {
    const globalUsers = Meteor.users;
    // Exercise config and the platform-specific hook without registering another
    // set of server methods or starting another client's auto-login timers.
    const secondary = Object.create(Accounts);
    secondary._options = { ...Accounts._options };
    secondary._usersCollectionChangeCallbacks = [];
    secondary.users = shared ? globalUsers : new Mongo.Collection(null);
    const replacement = new Mongo.Collection(`secondary_users_${Random.id()}`);
    try {
      secondary.config({ collection: replacement });
      test.isTrue(secondary.users === replacement);
      test.isTrue(Meteor.users === globalUsers);
    } finally {
      Meteor.users = globalUsers;
    }
  });

}

Tinytest.add('accounts - collection change - same name preserves instance', test => {
  const globalUsers = Meteor.users;
  const secondary = Object.create(Accounts);
  secondary._usersCollectionChangeCallbacks = [];
  const users = new Mongo.Collection(`same_users_${Random.id()}`);
  secondary.users = users;
  secondary._options = { ...Accounts._options, collection: users };
  let changes = 0;
  secondary.onUsersCollectionChanged(() => { changes++; });
  try {
    secondary.config({ collection: users._name });
    test.isTrue(secondary.users === users);
    test.equal(changes, 0);
    test.isTrue(Meteor.users === globalUsers);
  } finally {
    Meteor.users = globalUsers;
  }
});

if (Meteor.isServer) {
  Tinytest.addAsync('accounts - collection change - publications read current collection', async test => {
    const accounts = Object.create(Accounts);
    const oldUsers = new Mongo.Collection(null);
    const newUsers = new Mongo.Collection(null);
    accounts.users = oldUsers;
    let published;
    const registered = new Promise(resolve => {
      accounts._server = { publish(name, handler) {
        if (name === null && !published) {
          published = handler;
          resolve();
        }
      } };
    });
    accounts._initServerPublications();
    await registered;
    const userId = Random.id();
    await oldUsers.insertAsync({ _id: userId, profile: { source: 'old' } });
    await newUsers.insertAsync({ _id: userId, profile: { source: 'new' } });
    accounts.users = newUsers;
    const documents = await published.call({ userId }).fetchAsync();
    test.equal(documents, [{ _id: userId, profile: { source: 'new' } }]);
    test.equal(published.call({ userId: null }), null);
  });

  Tinytest.addAsync('accounts - collection change - indexes without mutation methods', async test => {
    const original = Accounts.users;
    const previousOption = Accounts._options.collection;
    const users = new Mongo.Collection(`server_only_users_${Random.id()}`, {
      defineMutationMethods: false,
    });
    const userId = await users.insertAsync({ username: Random.id() });
    const expectedIndexKeys = [
      'username', 'emails.address',
      'services.resume.loginTokens.hashedToken', 'services.password.enroll.when',
      'services.email.verificationTokens.token',
    ];
    try {
      Accounts.config({ collection: users });
      const keys = await waitForCollectionIndexes(users, expectedIndexKeys);
      for (const key of expectedIndexKeys) {
        test.isTrue(keys.includes(key), `Missing index: ${key}`);
      }
      test.isTrue(Meteor.users === users);
    } finally {
      Accounts.config({ collection: original });
      Accounts._options.collection = previousOption;
      await users.removeAsync(userId);
    }
  });
}
