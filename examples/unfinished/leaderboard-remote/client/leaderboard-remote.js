Leaderboard = Meteor.connect("http://leader2.meteor.com/sockjs");

// XXX I'd rather this be Leaderboard.Players.. can this API be easier?
Players = new Meteor.Collection("players", {manager: Leaderboard});

Template.main.events = {
  'keydown': function () {
    Session.set("error", null);
  },
  'click .add': function () {
    var name = $('#name').val();
    var score = $('#score').val();

    if (name.match(/^\s*$/)) {
      Session.set("error", "You must give a name");
      return;
    }
    if (score.match(/^\s*$/)) {
      Session.set("error", "You must give a score");
      return;
    }
    score = +score;
    if (isNaN(score)) {
      Session.set("error", "Score must be a number");
      return;
    }

    Players.insert({name: name, score: score});
    $('#name').val('');
    $('#score').val('');
  },
  'click .take-points': function () {
    var top = Players.findOne({}, {sort: {score: -1}});
    if (top)
      Players.update(top._id, {$inc: {score: -20}});
  },
};

Template.main.error = function () {
  return Session.get("error");
};

Template.main.average_score = function () {
  var count = 0;
  var total = 0;
  Players.find().forEach(function (player) {
    count++;
    total += player.score;
  });
  return total / count;
};
