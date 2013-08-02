Items = new Meteor.Collection("items");

if (Meteor.isServer) {
  Meteor.startup(function () {
    if (Items.find().count() === 0) {
      Items.insert({ text: 'Foo Greenspan', rank: 1 });
      Items.insert({ text: 'Bar Oliver', rank: 2 });
      Items.insert({ text: 'Beef Tofu', rank: 3 });
    }
  });
}
