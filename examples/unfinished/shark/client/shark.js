


Items = new Meteor.Collection(null);
Items.insert({ text: 'Foo' });
Items.insert({ text: 'Bar' });
Items.insert({ text: 'Baz' });

Body.augment({
  items: function () {
    return Items.find({}, { sort: { text: 1 }});
  },
  name: 'David'
});

twice = Template.twice;

Meteor.startup(function () {
  Items.insert({ text: 'Qux' });
  Items.remove({ text: 'Foo' });
  Items.update({ text: 'Bar' }, { text: 'Car' });
});
