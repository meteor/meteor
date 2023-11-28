import { Meteor } from 'meteor/meteor';
import { LinksCollection } from '/imports/api/links';
import { startApolloServer } from './apollo';

interface Link {
  title: string;
  url: string;
}

async function insertLink({ title, url }: Link): Promise<void> {
  await LinksCollection.insertAsync({ title, url, createdAt: new Date() });
}

try {
  startApolloServer().then();
} catch (e) {
  console.error(e.reason);
}

Meteor.startup(async (): Promise<void> => {
  // If the Links collection is empty, add some data.
  if (await LinksCollection.find().countAsync() === 0) {
    await insertLink({
      title: 'Do the Tutorial',
      url: 'https://www.meteor.com/tutorials/react/creating-an-app',
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