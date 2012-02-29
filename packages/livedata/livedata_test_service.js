App.methods({
  echo: function (/* arguments */) {
    return _.toArray(arguments);
  },
  exception: function (where) {
    var shouldThrow =
      (Meteor.is_server && where === "server") ||
      (Meteor.is_client && where === "client") ||
      where === "both";

    if (shouldThrow) {
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
  Meteor.publish('ledger', {
    collection: Ledger,
    selector: function (params) {
      return {world: params.world};
    }
  });

App.methods({
  'ledger/transfer': function (world, from_name, to_name, amount, cheat) {
    var from = Ledger.findOne({name: from_name, world: world});
    var to = Ledger.findOne({name: to_name, world: world});

    if (Meteor.is_server)
      cheat = false;

/*
    console.log("=== " + world + " ledger ===");
    Ledger.find({world: world}).forEach(function (x) {
      console.log(x.name + ": " + x.balance);
    });
*/

    if (!from) {
      this.error(404, "No such account " + from_name + " in " + world);
      return;
    }

    if (!to) {
      this.error(404, "No such account " + to_name + " in " + world);
      return;
    }

    if (from.balance < amount && !cheat) {
      this.error(409, "Insufficient funds");
      return;
    }

    Ledger.update({_id: from._id}, {$inc: {balance: -amount}});
    Ledger.update({_id: to._id}, {$inc: {balance: amount}});
  }
});