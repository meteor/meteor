import { Meteor } from 'meteor/meteor';

export async function waitForCollectionIndexes(users, expectedKeys) {
  const deadline = Date.now() + 30_000;
  let keys = [];

  while (true) {
    try {
      keys = (await users.rawCollection().indexes())
        .map(index => Object.keys(index.key).join(','));
    } catch (error) {
      // The collection may not exist until the first async index is created.
      if (error.code !== 26 && error.codeName !== 'NamespaceNotFound') {
        throw error;
      }
      keys = [];
    }

    if (expectedKeys.every(key => keys.includes(key)) || Date.now() >= deadline) {
      return keys;
    }

    await new Promise(resolve => Meteor.setTimeout(resolve, 100));
  }
}
