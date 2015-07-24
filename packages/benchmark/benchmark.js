var Durations = null;

var durationForId = {};
var totalDuration = 0;

Meteor.defer(() => {
  Durations = {
    _coll: new Mongo.Collection("durations", {connection: null}),
    add: function (id, duration) {
      var coll = this._coll;
      if (!coll)
        return;

      if (!coll.findOne(id)) {
        coll.insert({_id: id, duration: duration});
      } else {
        coll.update(id, {$inc: {duration: duration}});
      }
    },
    clear: function () {
      var coll = this._coll;
      coll.remove({});
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
      Durations.clear();
    }
  });
});

var lastTotalMs = 0;
Meteor.setInterval(() => {
  Npm.require('child_process').exec(
    "ps -p " + process.pid + " -o time | tail -1 | head -1",
    (err, stdout) => {
      var units = stdout.replace(":", ".").split(".").map(str => parseInt(str, 10));
      var totalMs = ((units[0] * 60 + units[1]) * 1000) + units[2] * 10;
      Durations.add("total", totalMs - lastTotalMs);
      lastTotalMs = totalMs;
    });
}, 1000);

var Fiber = Npm.require("fibers");

measureDuration = function (id, fn) {
  var startTime = process.hrtime();
  try {
//    if (Fiber.current.measuring) {
//      throw new Error("nested measure");
//    }

    Fiber.current.measuring = true;
    var savedYield = Fiber.yield;
    var missedMs = 0;
    var pausedHrtime;
    var newYield = function () {
      pausedHrtime = process.hrtime();
      Fiber.yield = savedYield;
      savedYield();
      Fiber.yield = newYield;
      var missedHrtime = process.hrtime(pausedHrtime);
      missedMs += missedHrtime[0] * 1000 + missedHrtime[1] / 1000000;
    };
    Fiber.yield = newYield;

    try {
      return fn();
    } finally {
      Fiber.yield = savedYield;
      Fiber.current.measuring = false;
    }
  } catch (e) {
    throw e;
  } finally {
    if (id !== "sub(\"durations\")") {
      var durationHrtime = process.hrtime(startTime);
      // convert `process.hrtime` return value to milliseconds
      var duration = durationHrtime[0] * 1000 + durationHrtime[1] / 1000000;
      duration -= missedMs;

      if (Durations) {
        Durations.add(id, duration);
        Durations.add("accounted", duration);
      }
    }
  }
};
