Items = new Mongo.Collection("items");

if (Meteor.isServer) {
  if (Items.find().count() === 0) {
    _.each(
      ["violet", "unicorn", "flask", "jar", "leitmotif", "rearrange", "right", "ethereal"],
      function (text, index) { Items.insert({text: text, rank: index}); });
  }
}
