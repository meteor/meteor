UI.body.items = Items.find({}, { sort: { rank: 1 } });

ReallyBasicRanks = {
  beforeFirst: function (firstRank) { return firstRank - 1; },
  between: function (beforeRank, afterRank) { return (beforeRank + afterRank) / 2; },
  afterLast: function (lastRank) { return lastRank + 1; }
};

UI.body.rendered = function () {
  this.$('#list').sortable({ // uses the 'sortable' interaction from jquery ui
    stop: function (event, ui) {
      var el = ui.item.get(0), before = ui.item.prev().get(0), after = ui.item.next().get(0);

      var newRank;
      if (!before) { // moving to the top of the list
        newRank = ReallyBasicRanks.beforeFirst(after.$ui.data().rank);
      } else if (!after) { // moving to the bottom of the list
        newRank = ReallyBasicRanks.afterLast(before.$ui.data().rank);
      } else {
        newRank = ReallyBasicRanks.between(before.$ui.data().rank, after.$ui.data().rank);
      }
      Items.update(el.$ui.data()._id, {$set: {rank: newRank}});
    }
  });
};
