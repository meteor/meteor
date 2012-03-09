// Set up a collection to contain player information. On the server,
// it is backed by a MongoDB collection named "players."
Players = new Meteor.Collection("players");

/*** Client ***/

if (Meteor.is_client) {
  $(document).ready(function () {
    // List the players by score. You can click to select a player.
    var scores = Meteor.ui.renderList(Players.find({}, {sort: {score: -1}}), {
      render: function (player) {
        if (Session.equals("selected_player", player._id))
          var style = "player selected";
        else
          var style = "player";

        return $('<div class="' + style + '">' +
                 '<div class="name">' + player.name + '</div>' +
                 '<div class="score">' + player.score + '</div></div>');
      },
      events: {
        "click": function () {
          Session.set("selected_player", this._id);
        }
      }
    });
    var leaderboard = $('<div class="leaderboard"></div>').append(scores);
    $('body').append(leaderboard);

    // Details area, showing the currently selected player.
    var details_elt = Meteor.ui.render(function () {
      var player = Players.findOne(Session.get("selected_player"));
      if (!player)
        return $('<div class="none">Click a player to select</div>');

      return $('<div class="details"><div class="name">' + player.name +
               '</div><input type="button" value="Give 5 points"></div>');
    }, {
      'click input': function () {
        Players.update(Session.get("selected_player"), {$inc: {score: 5}});
      }
    });
    $('body').append(details_elt);
  });
}

/*** Server ***/

// If you don't want your server code to be sent to the client
// (probably a good thing to avoid), you can just put it in a
// subdirectory named 'server'.

if (Meteor.is_server) {
  // On server startup, create some players if the database is empty.
  Meteor.startup(function () {
    if (Players.find().count() === 0) {
      var names = ["Glinnes Hulden", "Shira Hulden", "Ervil Savat",
                   "Lute Casagave", "Akadie", "Rhyl Shermatz",
                   "Yalden Wirp", "Tyran Lucho", "Bump Candolf",
                   "Carbo Gilweg"];
      for (var i = 0; i < names.length; i++)
        Players.insert({name: names[i], score: Math.floor(Math.random()*10)*5});
    }
  });
}
