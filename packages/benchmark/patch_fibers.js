var Fiber = Npm.require("fibers");

var nextFiberId = 0; // incrementing counter

var savedFiberRun = Fiber.prototype.run;
Fiber.prototype.run = function () {
  // helps with debugging, and seems harmless enough
  if (!this.id) {
    this.id = nextFiberId++;
  }

  if (!this.timers) {
    this.timers = [];
  }

//  if (!this.profilerEntry) {
//    this.profilerEntry = Fiber.current ? Fiber.current.profilerEntry : [];
//  }

  Fiber.current && pauseTimers(Fiber.current.timers);
  resumeTimers(this.timers);

  savedFiberRun.apply(this, arguments);

  pauseTimers(this.timers);
  Fiber.current && resumeTimers(Fiber.current.timers);
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

