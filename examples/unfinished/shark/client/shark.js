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


// XXX this is a Minimal Viable Implementation. Improve:
//
// - Strings rather than floating point numbers (making sure not to
// - add an additional bit on every bisection)
//
// - Add some randomization so that if two people reorder into the
//   same position you don't end up with the same rank. (Elements with
//   the same rank can't have anything placed in between)
//
// - At least prepare the ground for occasional rebalancing, in case
// - ranks get too long.
Ranks = {
  beforeFirst: function (firstRank) {
    return firstRank - 1;
  },
  between: function (beforeRank, afterRank) {
    return (beforeRank + afterRank) / 2;
  },
  afterLast: function (lastRank) {
    return lastRank + 1;
  }
};

// xcxc rendered didn't work and was surprising.
UI.body.attached = function () {
  $('#list').sortable({
    stop: function (event, ui) {
      var el = ui.item.get(0);
      var before = ui.item.prev().get(0);
      var after = ui.item.next().get(0);

      var newRank;
      if (!before) { // moving to the top of the list
        newRank = Ranks.beforeFirst(after.$ui.data().rank);
      } else if (!after) { // moving to the bottom of the list
        newRank = Ranks.afterLast(before.$ui.data().rank);
      } else {
        newRank = Ranks.between(before.$ui.data().rank, after.$ui.data().rank);
      }

      Items.update(el.$ui.data()._id, {$set: {rank: newRank}});
    }
  });
  $('.isotope').isotope({
    itemSelector : '.item',
    layoutMode: 'straightDown',
    getSortData: {
      rank: function (elem) {
        return elem[0].$ui.data().rank;
      }
    },
    sortBy: 'rank'
  });

  $('.isotope')[0].$uihooks = {
    removeElement: function (n) {
      $(n.parentNode).isotope('remove', $(n));
    },
    insertElement: function (n, parent, next) {
      $(parent).isotope('insert', $(n));
    },
    moveElement: function (n, parent, next) {
      $(parent).isotope('updateSortData', $(n));
      $(parent).isotope({sortBy: 'rank'});
    }
  };
};
