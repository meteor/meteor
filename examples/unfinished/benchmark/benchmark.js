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
    Messages._ensureIndex({room: 1});
    Messages._ensureIndex({when: 1});
    Rooms._ensureIndex({random: 1});
    Rooms._ensureIndex({when: 1});
  });

  // periodic document cleanup.
  // XXX only needs to run on one server.
  // XXX do we even need this with room deletion?
  if (PARAMS.messageHistorySeconds) {
    Meteor.setInterval(function () {
      var when = +(new Date) - PARAMS.messageHistorySeconds*1000;
      Messages.remove({when: {$lt: when}});
    }, 1000*PARAMS.messageHistorySeconds / 20);
  }

  // periodic room cleanup.
  // XXX only needs to run on one server.
  if (PARAMS.roomHistorySeconds) {
    Meteor.setInterval(function () {
      var when = +(new Date) - PARAMS.roomHistorySeconds*1000;
      Rooms.remove({when: {$lt: when}});
    }, 1000*PARAMS.roomHistorySeconds / 20);
  }



  Meteor.publish("rooms", function (clientId) {
    var self = this;
    check(clientId, String);

    var myRoom = Rooms.findOne(clientId);
    // yeah, yeah, i'm inserting in a publish function. deal with it.
    if (!myRoom) {
      myRoom = {_id: clientId, when: +(new Date()), random: Random.fraction()};
      Rooms.insert(myRoom);
    }
    self.added("rooms", clientId, myRoom);

    var otherRooms = Rooms.find({random: {$gte: Random.fraction()}},
                                {limit: PARAMS.roomsPerClient,
                                 order: {random: 1}}).fetch();

    _.each(otherRooms, function (room) {
      self.added("rooms", room._id, room);
    });

    self.ready();
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
    }
  });


  // XXX publish stats
  // - currentClients.length
  // - serverId
  // - num ddp sessions
  // - total documents

  Facts.setUserIdFilter(function () {return true;});
}



if (Meteor.isClient) {
  var myRooms = [];
  Meteor.subscribe("rooms", processId, function () {
    // XXX should autorun to change rooms? meh.
    var r = Rooms.find({}, {limit: PARAMS.roomsPerClient}).fetch();
    _.each(r, function (room) {
      Meteor.subscribe("messages", room._id);
      myRooms.push(room, room._id);
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
