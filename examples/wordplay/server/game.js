Meteor.methods({
  start_new_game: function (evt) {
    // create a new game w/ fresh board
    var game_id = Games.insert({board: new_board(),
                                clock: 120});

    // move everyone in the lobby to the game
    Players.update({game_id: null},
                   {$set: {game_id: game_id}},
                   {multi: true});

    // wind down the game clock
    var clock = 120;
    var interval = Meteor.setInterval(function () {
      clock -= 1;
      Games.update(game_id, {$set: {clock: clock}});
      if (clock === 0)
        Meteor.clearInterval(interval);
    }, 1000);

    return game_id;
  }
});

