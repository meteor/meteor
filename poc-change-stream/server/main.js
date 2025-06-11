import { Meteor } from 'meteor/meteor';
import { LinksCollection } from '/imports/api/links';

async function insertLink({ title, url }) {
  await LinksCollection.insertAsync({ title, url, createdAt: new Date() });
}

Meteor.startup(async () => {
  console.log('[Startup] Meteor server is starting...');
  // If the Links collection is empty, add some data.
  const count = await LinksCollection.find().countAsync();
  console.log(`[Startup] LinksCollection count: ${count}`);
  if (count === 0) {
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
    console.log('[Startup] Initial links inserted.');
  }

  Meteor.publish("links", function () {
    console.log('[Publish] links publication requested');
    return LinksCollection.find();
  });

  // Start Change Stream after Meteor is ready and connected to the database
  try {
    console.log('[ChangeStream] Trying to start Change Stream...');
    const changeStream = LinksCollection.watchChangeStream([
      { $match: { operationType: 'insert' } }
    ]);
    console.log('[ChangeStream] Change Stream started:', !!changeStream);
    changeStream.on('change', (change) => {
      console.log('[ChangeStream] Change event detected:', JSON.stringify(change, null, 2));
    });
    changeStream.on('error', (err) => {
      console.error('[ChangeStream] Error:', err);
    });
    changeStream.on('close', () => {
      console.log('[ChangeStream] Closed');
    });
    changeStream.on('message', (message) => {
      console.log('[ChangeStream] Message:', message);
    });
    console.log('[ChangeStream] Change Stream successfully configured.');
  } catch (e) {
    console.error('[ChangeStream] Failed to start Change Stream:', e);
  }

  // Example: Using observeChanges with changeStreams enabled
  try {
    console.log('[observeChanges] Trying to start observeChanges with changeStreams...');
    const handle = LinksCollection.find().observeChanges({
      changeStreams: true,
      added: (id, fields) => {
        console.log('[observeChanges] added', id, fields);
      },
      changed: (id, fields) => {
        console.log('[observeChanges] changed', id, fields);
      },
      removed: (id) => {
        console.log('[observeChanges] removed', id);
      },
      onError: (err) => {
        console.error('[observeChanges] Error:', err);
      }
    });
    console.log('[observeChanges] observeChanges successfully configured.', !!handle);
  } catch (e) {
    console.error('[observeChanges] Failed to start observeChanges:', e);
  }
  // End of observeChanges with changeStreams example
});
