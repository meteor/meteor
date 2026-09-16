import { Meteor } from 'meteor/meteor';
import pino from 'pino';
import { createClient } from 'grubba-rpc';

import { LinksCollection } from '/imports/api/links';
import { TestEmail } from '/imports/emails/TestEmail';

console.log('-> TestEmail loaded', !!TestEmail);

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: "UTC:yyyy-mm-dd HH:MM:ss.l o",
      ignore: "pid,hostname"
    }
  },
  browser: { asObject: true }
});

// Issue with thread-stream "Cannot find module '/_build/main-dev/lib/worker.js'"
// Ensure `Meteor.compileWithMeteor(["thread-stream"])` works
console.log("logger loaded", !!logger);

// Issue with npm deps that require compilation as not transpiled
// Ensure `Meteor.compileWithRspack(["grubba-rpc"])` works
console.log("grubba-rpc's createClient", !!createClient);

async function insertLink({ title, url }) {
  await LinksCollection.insertAsync({ title, url, createdAt: new Date() });
}

Meteor.startup(async () => {
  // If the Links collection is empty, add some data.
  if (await LinksCollection.find().countAsync() === 0) {
    await insertLink({
      title: 'Do the Tutorial',
      url: 'https://react-tutorial.meteor.com/simple-todos/01-creating-app.html',
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

  // We publish the entire Links collection to all clients.
  // In order to be fetched in real-time to the clients
  Meteor.publish("links", function () {
    return LinksCollection.find();
  });
});
