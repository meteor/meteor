// Pick which scenario we run. Pass the 'SCENARIO' environment variable
// to change this. See 'benchmark-scenarios.js' for the list of
// scenarios.

var PARAMS = {};
if (Meteor.isServer) {
  if (!Meteor.settings.params)
    throw new Error("Must set scenario with Meteor.settings");
  __meteor_runtime_config__.PARAMS = PARAMS = Meteor.settings.params;
} else {
  PARAMS = __meteor_runtime_config__.PARAMS;
}

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
  ret.bucket = random(PARAMS.numBuckets);
  // XXX trusting client clock is wrong!!
  ret.when = +(new Date);
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
  Meteor.startup(function () {
    // clear all the collections.
    _.each(Collections, function (C) {
      C.remove({});
    });

    // insert initial docs
    _.times(PARAMS.initialDocuments, function () {
      pickCollection().insert(generateDoc());
    });
  });

  if (PARAMS.maxAgeSeconds) {
    Meteor.setInterval(function () {
      var when = +(new Date) - PARAMS.maxAgeSeconds*1000;
      _.each(Collections, function (C) {
        C.remove({when: {$lt: when}});
      });
      // Clear out 5% of the DB each time, steady state. XXX parameterize?
    }, 1000*PARAMS.maxAgeSeconds / 20);
  }

  Meteor.publish("data", function (collection, bucket) {
    var C = Collections[collection];
    return C.find({bucket: bucket});
  });

}



if (Meteor.isClient) {
  // sub to data
  _.times(PARAMS.numCollections, function (n) {
    Meteor.subscribe("data", n, random(PARAMS.numBuckets));
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
    return Session.get('updateRate') + ", " + Session.get('updateAvg');
  };

  // do stuff periodically

  if (PARAMS.insertsPerSecond) {
    Meteor.setInterval(function () {
      pickCollection().insert(generateDoc());
    }, 1000 / PARAMS.insertsPerSecond);
  }

  if (PARAMS.removesPerSecond) {
    Meteor.setInterval(function () {
      var C = pickCollection();
      var docs = C.find({}).fetch();
      var doc = Random.choice(docs);
      if (doc)
        C.remove(doc._id);
    }, 1000 / PARAMS.removesPerSecond);
  }

  if (PARAMS.updatesPerSecond) {
    Meteor.setInterval(function () {
      var C = pickCollection();
      var docs = C.find({}).fetch();
      var doc = Random.choice(docs);
      if (doc) {
        var field = 'Field' + random(PARAMS.documentNumFields);
        var modifer = {};
        modifer[field] =
          randomString(PARAMS.documentSize/PARAMS.documentNumFields);
        C.update(doc._id, {$set: modifer});
      }
    }, 1000 / PARAMS.updatesPerSecond);
  }


  // XXX very rough per client update rate. we need to measure this
  // better. ideally, on the server we could get the global update rate
  var updateCount = 0;
  var updateHistory = [];
  var updateFunc = function () { updateCount += 1; };
  _.each(Collections, function (C) {
    C.find({}).observe({
      added: updateFunc, changed: updateFunc, removed: updateFunc
    });
  });
  Meteor.setInterval(function () {
    updateHistory.push(updateCount);
    if (updateHistory.length > 10)
      updateHistory.shift();
    Session.set('updateRate', updateCount);
    Session.set('updateAvg', _.reduce(updateHistory, function(memo, num){
      return memo + num; }, 0) / updateHistory.length);;
    updateCount = 0;
  }, 1000);

}
