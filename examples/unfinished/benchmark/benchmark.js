
// Pick scenario from settings.
// XXX settings now has public. could move stuff there and avoid this.
var PARAMS = {};
if (Meteor.isServer) {
  if (!Meteor.settings.params)
    throw new Error("Must set scenario with Meteor.settings");
  __meteor_runtime_config__.PARAMS = PARAMS = Meteor.settings.params;
} else {
  PARAMS = __meteor_runtime_config__.PARAMS;
}


// id for this client or server.
var processId = Random.id();
console.log("processId", processId);


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

var pickCollection = function () {
  return Random.choice(Collections);
};

var generateDoc = function () {
  var ret = {};
  ret.fromProcess = processId;
  _.times(PARAMS.documentNumFields, function (n) {
    ret['Field' + n] = randomString(PARAMS.documentSize/PARAMS.documentNumFields);
  });

  return ret;
};


//////////////////////////////
// Data
//////////////////////////////


var Collections = [];
_.times(PARAMS.numCollections, function (n) {
  Collections.push(new Meteor.Collection("Collection" + n));
});


if (Meteor.isServer) {

  // Make sure we have indexes. Helps mongo CPU usage.
  Meteor.startup(function () {
    _.each(Collections, function (C) {
      C._ensureIndex({toProcess: 1});
      C._ensureIndex({fromProcess: 1});
      C._ensureIndex({when: 1});
    });
  });

  // periodic db check. generate a client list.
  var currentClients = [];
  var totalDocs = 0;
  Meteor.setInterval(function () {
    var newClients = {};
    var newTotal = 0;
    // XXX hardcoded time
    var since = +(new Date) - 1000*PARAMS.insertsPerSecond * 5;
    _.each(Collections, function (C) {
      _.each(C.find({when: {$gt: since}}, {fields: {fromProcess: 1, when: 1}}).fetch(), function (d) {
        newTotal += 1;
        if (d.fromProcess && d.when > since)
          newClients[d.fromProcess] = true;
      });
    });
    currentClients = _.keys(newClients);
    totalDocs = newTotal;
  }, 3*1000); // XXX hardcoded time

  // periodic document cleanup.
  if (PARAMS.maxAgeSeconds) {
    Meteor.setInterval(function () {
      var when = +(new Date) - PARAMS.maxAgeSeconds*1000;
      _.each(Collections, function (C) {
        C.remove({when: {$lt: when}});
      });
      // Clear out 5% of the DB each time, steady state. XXX parameterize?
    }, 1000*PARAMS.maxAgeSeconds / 20);
  }

  Meteor.publish("data", function (collection, process) {
    check(collection, Number);
    check(process, String);
    var C = Collections[collection];
    return C.find({toProcess: process});
  });

  Meteor.methods({
    'insert': function (doc) {
      check(doc, Object);
      check(doc.fromProcess, String);
      // pick a random destination. send to ourselves if there is no one
      // else. by having an entry in the db, we'll end up in the target
      // list.
      doc.toProcess = Random.choice(currentClients) || doc.fromProcess;

      doc.when = +(new Date);

      var C = pickCollection();
      C.insert(doc);
    },
    update: function (processId, field, value) {
      check([processId, field, value], [String]);
      var modifer = {};
      modifer[field] = value; // XXX injection attack?

      var C = pickCollection();
      // update one message.
      C.update({fromProcess: processId}, {$set: modifer}, {multi: false});
    },
    remove: function (processId) {
      check(processId, String);
      var C = pickCollection();
      // remove one message.
      var obj = C.findOne({fromProcess: processId});
      if (obj)
        C.remove(obj._id);
    }
  });


  // XXX publish stats
  // - currentClients.length
  // - serverId
  // - num ddp sessions
  // - total documents
}



if (Meteor.isClient) {
  // sub to data
  _.times(PARAMS.numCollections, function (n) {
    Meteor.subscribe("data", n, processId);
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

  // XXX count of how many docs are in local collection?


  // do stuff periodically

  if (PARAMS.insertsPerSecond) {
    Meteor.setInterval(function () {
      Meteor.call('insert', generateDoc());
    }, 1000 / PARAMS.insertsPerSecond);
  }

  if (PARAMS.updatesPerSecond) {
    Meteor.setInterval(function () {
      Meteor.call('update',
                  processId,
                  'Field' + random(PARAMS.documentNumFields),
                  randomString(PARAMS.documentSize/PARAMS.documentNumFields)
                 );
    }, 1000 / PARAMS.updatesPerSecond);
  }

  if (PARAMS.removesPerSecond) {
    Meteor.setInterval(function () {
      Meteor.call('remove', processId);
    }, 1000 / PARAMS.removesPerSecond);
  }



  // XXX very rough per client update rate. we need to measure this
  // better. ideally, on the server we could get the global update rate
  var updateCount = 0;
  var updateHistories = {1: [], 10: [], 100: [], 1000: []};
  var updateFunc = function () { updateCount += 1; };
  _.each(Collections, function (C) {
    C.find({}).observeChanges({
      added: updateFunc, changed: updateFunc, removed: updateFunc
    });
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
