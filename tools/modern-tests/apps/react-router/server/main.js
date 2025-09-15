import { Meteor } from 'meteor/meteor';
import { S3mini } from "s3mini";
import { LinksCollection } from '/imports/api/links';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import '@helper/alias';
import ReactAlias from '@react/alias';
import './resolve-extensions/first';
import { TypescriptEnabled } from './ts/helpers';
import bcrypt from "bcrypt";

console.log('@react/alias loaded', ReactAlias.version);
console.log('TypescriptEnabled', TypescriptEnabled);
console.log("bcrypt loaded", !!bcrypt);

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

console.log("--> S3mini imported: ", !!S3mini);
console.log("--> StreamableHTTPClientTransport imported: ", !!StreamableHTTPClientTransport);
