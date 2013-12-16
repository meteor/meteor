// Wrap a transform function to return objects that have the _id field
// of the untransformed document. This ensures that subsystems such as
// the observe-sequence package that call `observe` can keep track of
// the documents identities.
//
// - Require that it returns objects
// - If the return value has an _id field, verify that it matches the
//   original _id field
// - If the return value doesn't have an _id field, add it back.
LocalCollection.wrapTransform = function(transform) {
  if (!transform)
    return undefined;

  return function (doc) {
    var id = doc._id;
    var transformed = transform(doc);

    if (typeof transformed !== 'object' ||
        transformed instanceof Array ||
        // Even though fine technically, don't let Mongo ObjectIDs
        // through. It would suck to think your app works until
        // you insert the first document using Meteor.
        transformed instanceof Meteor.Collection.ObjectID) {
      throw new Error("transform must return object");
    }

    if (transformed._id) {
      if (transformed._id !== id) {
        throw new Error("transformed document can't have different _id");
      }
    } else {
      transformed._id = id;
    }
    return transformed;
  };
};

