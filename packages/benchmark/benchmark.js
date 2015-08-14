Durations = {

};

var Durations = null;

getDurations = function () {
  return Durations.durations;
};

var durationForId = {};
var totalDuration = 0;

Meteor.defer(() => {
  Durations = {
    durations: {},
    _coll: new Mongo.Collection("durations", {connection: null}),
    add: function (id, duration) {
      if (!this.durations[id])
        this.durations[id] = 0;
      this.durations[id] += duration;
    },
    clear: function () {
      this.durations = {};
      this._coll.remove({});
    },
    publish: function () {
      var coll = this._coll;
      Meteor.publish("durations", function () {
        return coll.find();
      });
    }
  };

  Durations.publish();

  Meteor.methods({
    "Durations.clear": function () {
      console.log("Durations.clear");
      Durations.clear();
    }
  });

  var prevTotalMs = 0;

  Meteor.setInterval(() => {
    Npm.require('child_process').exec(
      "ps -p " + process.pid + " -o time | tail -1 | head -1",
      (err, stdout) => {
        var units = stdout.replace(":", ".").split(".").map(str => parseInt(str, 10));
        var totalMs = ((units[0] * 60 + units[1]) * 1000) + units[2] * 10;
        Durations.add("total", totalMs - prevTotalMs);
        prevTotalMs = totalMs;

        var coll = Durations._coll;
        _.each(Durations.durations, function (duration, id) {
          if (!coll.findOne(id)) {
            coll.insert({_id: id, duration: duration});
          } else {
            coll.update(id, {$set: {duration: duration}});
          }
        });
      });
  }, 5000);
});

var Fiber = Npm.require("fibers");


/*
var profiler = Npm.require('gc-profiler');
profiler.on('gc', function (info) {
  if (Durations) {
    measure("gc", info.duration);
  }
});

*/
