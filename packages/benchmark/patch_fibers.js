var Fiber = Npm.require("fibers");
var _ = Npm.require("underscore");

var nextFiberId = 0; // incrementing counter

var savedFiberRun = Fiber.prototype.run;
Fiber.prototype.run = function (...args) {
  // helps with debugging, and seems harmless enough
  if (!this.id) {
    this.id = nextFiberId++;
  }

  if (!this.timers) {
    this.timers = [];
  }

  Fiber.current && pauseTimers(Fiber.current.timers);
  resumeTimers(this.timers);

  try {
    return savedFiberRun.apply(this, args);
  } finally {
    pauseTimers(this.timers);
    Fiber.current && resumeTimers(Fiber.current.timers);
  }
};

function pauseTimers(timers) {
  for (var i = 0; i < timers.length; i++) {
    timers[i].stop();
  }
};

function resumeTimers(timers) {
  for (var i = 0; i < timers.length; i++) {
    timers[i].start();
  }
};

