// Pick which scenario we run. Pass the 'SCENARIO' environment variable
// to change this. See 'benchmark-scenarios.js' for the list of
// scenarios.

var PARAMS = {};
// XXX settings now has public. could move stuff there and avoid this.
if (Meteor.isServer) {
  if (!Meteor.settings.params)
    throw new Error("Must set scenario with Meteor.settings");
  __meteor_runtime_config__.PARAMS = PARAMS = Meteor.settings.params;
} else {
  PARAMS = __meteor_runtime_config__.PARAMS;
}

// id for this client or server.
var processId = Random.id();
console.log("SSS", processId);


//////////////////////////////
// Helper Functions
//////////////////////////////

var random = function (n) {
  return Math.floor(Random.fraction() * n);
};

var randomChars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('');
var randomString = function (length) {
  // XXX make more efficient
  var ret = '';
  _.times(length, function () {
    ret += Random.choice(randomChars);
  });
  return ret;
};


//////////////////////////////
// Data
//////////////////////////////


Rooms = new Meteor.Collection("rooms");
Messages = new Meteor.Collection("messages");


if (Meteor.isServer) {
  // init
  Meteor.startup(function () {
    if (!Rooms.findOne()) {
      Meteor.call('setNumRooms', PARAMS.initialNumRooms);
    }
    Messages._ensureIndex({room: 1});
    Messages._ensureIndex({when: 1});
  });

  // periodic document cleanup.
  // XXX only needs to run on one server.
  if (PARAMS.messageHistorySeconds) {
    Meteor.setInterval(function () {
      var when = +(new Date) - PARAMS.messageHistorySeconds*1000;
      Messages.remove({when: {$lt: when}});
    }, 1000*PARAMS.messageHistorySeconds / 20);
  }

  Meteor.publish("rooms", function () {
    return Rooms.find({});
  });

  Meteor.publish("messages", function (roomId) {
    check(roomId, String);
    return Messages.find({room: roomId});
  });

  Meteor.methods({
    'insert': function (doc) {
      check(doc, {
        from: String,
        room: String,
        message: String
      });

      // use server clock, don't trust the client.
      doc.when = +(new Date);

      Messages.insert(doc);
    },

    setNumRooms: function (numRooms) {
      check(numRooms, Match.Integer);
      var current = Rooms.find({}).count();
      if (current > numRooms) {
        _.times(current - numRooms, function () {
          Rooms.remove(Rooms.findOne({}, {fields: {_id: true}}));
        });
      } else if (current < numRooms) {
        _.times(numRooms - current, function () {
          Rooms.insert({});
        });
      }
    }
  });


  // XXX publish stats
  // - currentClients.length
  // - serverId
  // - num ddp sessions
  // - total documents
}



if (Meteor.isClient) {
  var myRooms = [];
  Meteor.subscribe("rooms", function () {
    var r = Rooms.find({}).fetch();
    // XXX should pick w/o replacement!
    _.times(PARAMS.roomsPerClient, function () {
      var room = Random.choice(r)._id;
      Meteor.subscribe("messages", room);
      myRooms.push(room);
    });
  });

  // templates
  Template.params.params = function () {
    return _.map(PARAMS, function (v, k) {
      return {key: k, value: v};
    });
  };

  Template.status.status = function () {
    return Meteor.status().status;
  };

  Template.status.updateRate = function () {
    return (Session.get('updateAvgs') || []).join(", ");
  };

  // XXX count of how many docs are in local collection. don't 

  // do stuff periodically
  Meteor.setInterval(function () {
    if (Random.fraction() < PARAMS.chanceClientIsTalkative) {
      console.log("Talking");
      var room = Random.choice(myRooms);
      if (!room) return;
      var numMessages = PARAMS.talkativePeriodSeconds *
            PARAMS.talkativeMessagesPerSecond;
      _.times(numMessages, function (i) {
        Meteor.setTimeout(function () {
          Meteor.call('insert', {
            from: processId,
            room: room,
            message: randomString(PARAMS.messageSize)
          });
        }, 1000 * i / PARAMS.talkativeMessagesPerSecond);
      });
    }
  }, PARAMS.talkativePeriodSeconds * 1000);


  // XXX very rough per client update rate. we need to measure this
  // better. ideally, on the server we could get the global update rate
  var updateCount = 0;
  var updateHistories = {1: [], 10: [], 100: [], 1000: []};
  var updateFunc = function () { updateCount += 1; };
  Messages.find({}).observeChanges({
    added: updateFunc, changed: updateFunc, removed: updateFunc
  });
  Meteor.setInterval(function () {
    _.each(updateHistories, function (h, max) {
      h.push(updateCount);
      if (h.length > max)
        h.shift();
    });
    Session.set('updateAvgs', _.map(updateHistories, function (h) {
      return _.reduce(h, function(memo, num) {
        return memo + num;
      }, 0) / h.length;
    }));;
    updateCount = 0;
  }, 1000);

}
