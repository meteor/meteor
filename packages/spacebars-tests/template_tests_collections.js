Items = new Mongo.Collection("items");

if (Meteor.isServer) {
  if (Items.find().count() === 0) {
    _.each(_.range(0, 100), function (index) {
      Items.insert({
        number: index
      });
    });
  }

  Meteor.publish("items", function (startIndex) {
    return Items.find({number: {$gte: startIndex}});
  });
}
