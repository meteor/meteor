


Items = new Meteor.Collection(null);
Items.insert({ text: 'Foo' });
Items.insert({ text: 'Bar' });
Items.insert({ text: 'Baz' });

Body({
  items: function () {
    return Items.find({}, { sort: { text: 1 }});
  },
  name: 'David'
});

Meteor.startup(function () {
  Items.insert({ text: 'Qux' });
  Items.remove({ text: 'Foo' });
  Items.update({ text: 'Bar' }, { text: 'Car' });
});
