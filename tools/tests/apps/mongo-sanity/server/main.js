import { Mongo } from 'meteor/mongo';

const collection = new Mongo.Collection("sanity");

Meteor.startup(() => {
  let doc = collection.findOne();

  if (! doc) {
    collection.insert({ count: 0 });
    doc = collection.findOne();
  }

  collection.update(doc._id, {
    $inc: { count: 1 }
  });

  console.log("count: " + collection.findOne().count);
});
