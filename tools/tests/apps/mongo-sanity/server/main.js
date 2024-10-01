import { Mongo } from 'meteor/mongo';

const collection = new Mongo.Collection("sanity");

Meteor.startup(async () => {
  let doc = await collection.findOneAsync();

  if (! doc) {
    await collection.insertAsync({ count: 0 });
    doc = await collection.findOneAsync();
  }

  await collection.updateAsync(doc._id, {
    $inc: { count: 1 }
  });

  console.log("count: " + (await collection.findOneAsync()).count);
});
