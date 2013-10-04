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

UI.body.showFooter = function () {
  return Session.get("showFooter");
};
Meteor.setInterval(function () {
  Session.set("showFooter", !Session.get("showFooter"));
}, 3000);

UI.body.counter = function () {
  return Session.get("counter");
};
Meteor.setInterval(function () {
  Session.set("counter", (Session.get("counter") || 0) + 1);
}, 100);

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

var randomRank = function () {
  var first = Items.findOne({}, {sort: {rank: 1}});
  var last = Items.findOne({}, {sort: {rank: -1}});
  var newRank;
  if (first && last)
    return first.rank-1 + (Random.fraction() * (last.rank - first.rank + 2));
  else
    return 0;
};

_.each({
  'click #add': function () {
    var words = ["violet", "unicorn", "flask", "jar", "leitmotif", "rearrange", "right", "ethereal"];
    Items.insert({text: Random.choice(words) + " " + Random.hexString(2), rank: randomRank()});
  },
  'click #remove': function () {
    var item = Random.choice(Items.find().fetch());
    Items.remove(item._id);
  },
  'click #move': function () {
    var item = Random.choice(Items.find({}, {sort: {rank: 1}}).fetch().slice(1, -1));
    if (item) {
      var firstRank = Items.findOne({}, {sort: {rank: 1}}).rank;
      var lastRank = Items.findOne({}, {sort: {rank: -1}}).rank;
      var newRank = Random.choice([firstRank - 1, lastRank + 1]);
      Items.update(item._id, {$set: {rank: newRank}});
    }
  }
}, function (handler, spec) {
  var space = spec.indexOf(' ');
  var eventType = spec.slice(0, space);
  var selector = spec.slice(space+1);
  $(document).on(eventType, selector, handler);
});

UI.body.rendered = function () {
  $(this.find('#list')).sortable({
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
};
