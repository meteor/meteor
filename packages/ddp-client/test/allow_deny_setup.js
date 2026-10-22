export const FlickerCollectionName = `allow_deny_flicker`;
export const FlickerCollection = new Mongo.Collection(FlickerCollectionName);

if (Meteor.isServer) {
  FlickerCollection.allow({
    insert: () => true,
    update: () => true,
    remove: () => true,
    insertAsync: () => true,
    updateAsync: () => true,
    removeAsync: () => true,
  });

  Meteor.publish(`pub-${FlickerCollectionName}`, function() {
    return FlickerCollection.find();
  });
}