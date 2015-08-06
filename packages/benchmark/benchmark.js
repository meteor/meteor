var nextTimerId = 0;

var runningTimer = null;

Timer = class Timer {
  start() {
    if (!this.id)
      this.id = nextTimerId++;
//    console.trace("start", this.id);

    if (runningTimer) {
      console.trace("timer already running");
    }
    runningTimer = this;

    if (this.startTime) {
      console.trace("already running");
    }
    if (!this._total) {
      this._total = 0;
    }
    this.startTime = process.hrtime();
  }
  stop() {
//    console.trace("stop", this.id);

    if (!runningTimer) {
      console.trace("no timer is even running");
    }
    if (runningTimer !== this) {
      console.trace("not the running timer");
    }
    if (!this.startTime) {
      console.trace("not running");
    }
    var durationHrtime = process.hrtime(this.startTime);
    delete this.startTime;
    runningTimer = null;
    this._total += durationHrtime[0] * 1000 + durationHrtime[1] / 1000000;
  }
  total() {
    return this._total;
  }
};

var Durations = null;

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
var trueYield = Fiber.yield;

measure = function (id, duration) {
  if (Durations) {
    Durations.add(id, duration);
    Durations.add("accounted", duration);
  }
};

// opts:
// - entireTime: calls to `Meteor.bindEnvironment` don't generate a new id
measureDuration = function (id, fn, opts) {
//  fn();
//  return;

  var timerToStartOnceDone = runningTimer;
//  console.log("timetToStartOnceDone stop", runningTimer && runningTimer.id); 
  timerToStartOnceDone && timerToStartOnceDone.stop();

//  opts = opts || {};

  var timer = new Timer;
/*
  if (Fiber.current.overrideMeasureId) {
    throw new Error("Can't nest \"entireTime\" measures");
  }

  if (opts.entireTime) {
    Fiber.current.overrideMeasureId = id;
  }
*/
//  var currentFiberRun = Fiber.current.run.bind(Fiber.current);
/*
  Fiber.current.run = function () {
    if (runningTimer)
      runningTimer.stop();

    timer.start();
    currentFiberRun();
  };
*/
  timer.start();

  var origFiberYield = Fiber.yield;
  var newFiberYield = function () {
    timer.stop();
    console.log("before yield");
    Fiber.yield = trueYield;
    try {
      origFiberYield();
    } finally {
      Fiber.yield = newFiberYield;
      console.log("after yield");
      timer.start();
    }
  };
  Fiber.yield = newFiberYield;

  try {
    return fn();
  } finally {
    if (timer.startTime)
      console.log(">>> would have failed here stopping timer");
    else
      timer.stop();

    Fiber.yield = origFiberYield;

    timerToStartOnceDone && timerToStartOnceDone.start();

/*
    if (id !== "sub(\"durations\")") {
      measure(id, timer.total());
    }
*/
//    Fiber.current.run = currentFiberRun;
//    delete Fiber.current.overrideMeasureId;
  }
};

var profiler = Npm.require('gc-profiler');
profiler.on('gc', function (info) {
  if (Durations) {
    measure("gc", info.duration);
  }
});
