// Set up a collection to contain player information. On the server,
// it is backed by a MongoDB collection named "players."
Players = Sky.Collection("players");

/*** Client ***/

if (Sky.is_client) {
  // Get the top 10 players from the server, updated continuously.
  Sky.subscribe("top10");

  // Start with no player selected.
  Session.set("selected_player", null);

  $(document).ready(function () {
    // List the players by score. You can click to select a player.
    var scores = Sky.ui.renderList(Players, {
      sort: {score: -1}, // sort from high to low score
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
    var details_elt = Sky.ui.render(function () {
      var selected_player = Session.get("selected_player");
      if (!selected_player)
        return $('<div class="none">Click a player to select</div>');

      var player = Players.find(selected_player);
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

if (Sky.is_server) {
  // Publish the top 10 players, live, to any client that wants them.
  Sky.publish("top10", {collection: Players, sort: {score: -1},
                        limit: 10});

  // On server startup, create some players if the database is empty.
  Sky.startup(function () {
    if (Players.find().length === 0) {
      var names = ["Glinnes Hulden", "Shira Hulden", "Denzel Warhound",
                   "Lute Casagave", "Akadie", "Thammas, Lord Gensifer",
                   "Ervil Savat", "Duissane Trevanyi", "Sagmondo Bandolio",
                   "Rhyl Shermatz", "Yalden Wirp", "Tyran Lucho",
                   "Bump Candolf", "Wilmer Guff", "Carbo Gilweg"];
      for (var i = 0; i < names.length; i++)
        Players.insert({name: names[i], score: Math.floor(Math.random()*10)*5});
    }
  });
}
