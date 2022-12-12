import { Meteor } from 'meteor/meteor';
import Links from './collections/Links.js';

async function insertLink({ title, url }) {
  await Links.insertAsync({ title, url, createdAt: new Date() });
}

Meteor.startup(async () => {
  // If the Links collection is empty, add some data.
  if (await Links.find().countAsync() === 0) {
    await insertLink({
      title: 'Do the Tutorial',
      url: 'https://vue-tutorial.meteor.com/',
    });

    await insertLink({
      title: 'Follow the Guide',
      url: 'https://guide.meteor.com',
    });

    await insertLink({
      title: 'Read the Docs',
      url: 'https://docs.meteor.com',
    });

    await insertLink({
      title: 'Discussions',
      url: 'https://forums.meteor.com',
    });
  }
});
