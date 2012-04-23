Meteor.methods({
  nothing: function () {
  },
  echo: function (/* arguments */) {
    return _.toArray(arguments);
  },
  exception: function (where, intended) {
    var shouldThrow =
      (Meteor.is_server && where === "server") ||
      (Meteor.is_client && where === "client") ||
      where === "both";

    if (shouldThrow) {
      var e;
      if (intended)
        e = new Meteor.Error(999, "Client-visible test exception");
      else
        e = new Error("Test method throwing an exception");
      e.expected = true;
      throw e;
    }
  }
});

/*****/

Ledger = new Meteor.Collection("ledger");

Meteor.startup(function () {
  if (Meteor.is_server)
    Ledger.remove({}); // XXX can this please be Ledger.remove()?
});

if (Meteor.is_server)
  Meteor.publish('ledger', function (world) {
    return Ledger.find({world: world}, {key: {collection: 'ledger',
                                              world: world}});
  });

Meteor.methods({
  'ledger/transfer': function (world, from_name, to_name, amount, cheat) {
    var from = Ledger.findOne({name: from_name, world: world});
    var to = Ledger.findOne({name: to_name, world: world});

    if (Meteor.is_server)
      cheat = false;

    if (!from)
      throw new Meteor.Error(404,
                             "No such account " + from_name + " in " + world);

    if (!to)
      throw new Meteor.Error(404,
                             "No such account " + to_name + " in " + world);

    if (from.balance < amount && !cheat)
      throw new Meteor.Error(409, "Insufficient funds");

    Ledger.update({_id: from._id}, {$inc: {balance: -amount}});
    Ledger.update({_id: to._id}, {$inc: {balance: amount}});
    Meteor.refresh({collection: 'ledger', world: world});
  }
});