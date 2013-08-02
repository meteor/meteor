Meteor.startup(function () {
  /*
  Meteor.setTimeout(function () {
    Items.insert({ text: 'Qux' });
    Items.remove({ text: 'Foo' });
    Items.update({ text: 'Bar' }, { text: 'Coke' });
  }, 1000);
   */
});

UI.body.name = 'World';

UI.body.items = Items.find({}, { sort: { rank: 1 }});



// xcxc rendered didn't work and was surprising.
UI.body.attached = function () {
  $('#list').sortable({
    stop: function (event, ui) {
      // xcxc use jQuery .prev() instead of previousElementSibling

      el = ui.item[0]; // unbox jQuery array
      var before = el.previousElementSibling;
      var after = el.nextElementSibling;

      var doc = el.$ui.data();

      // xcxc improve rank generation.
      var newRank;
      if (before === null) { // moving to the top of the list
        var firstDoc = after.$ui.data();
        newRank = firstDoc.rank-1;
      } else if (after === null) { // moving to the bottom of the list
        var lastDoc = before.$ui.data();
        newRank = lastDoc.rank+1;
      } else {
        var beforeDoc = before.$ui.data();
        var afterDoc = after.$ui.data();
        newRank = (beforeDoc.rank + afterDoc.rank) / 2;
      }

      Items.update(doc._id, {$set: {rank: newRank}});
    }
  });
};
