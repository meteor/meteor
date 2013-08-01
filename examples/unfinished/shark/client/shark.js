Items = new Meteor.Collection(null);
Items.insert({ text: 'Foo Greenspan' });
Items.insert({ text: 'Bar Oliver' });
Items.insert({ text: 'Beef Tofu' });

Meteor.startup(function () {
  /*
  Meteor.setTimeout(function () {
    Items.insert({ text: 'Qux' });
    Items.remove({ text: 'Foo' });
    Items.update({ text: 'Bar' }, { text: 'Coke' });
  }, 1000);
   */
});

UI.body.name = 'David';

UI.body.items = Items.find({}, { sort: { text: 1 }});



// xcxc rendered didn't work and was surprising.
UI.body.attached = function () {
  $('#list').sortable();
};

// TO REPRO FAILURE:
// 1. Move "Bar Oliver" to the bottom of the list
// 2. Call `funkyReorder()`.
var funkyIteration = 0;
funkyReorder = function () {
  var chars = "THEMAGICALMACHINETHATDOESNTBREAKNOMATTERWHATYOUDOWITHIT";
  Items.find({}, {sort: {text: 1}}).forEach(function (item) {
    Items.update(item._id, {
      text: chars[funkyIteration++] + item.text.slice(1)
    });
  });
};