var Fiber = Npm.require('fibers');
var Profile = Npm.require("meteor-profiler").Profile;

function sleep(ms) {
  var fiber = Fiber.current;
  setTimeout(function() {
    fiber.run();
  }, ms);
  Fiber.yield();
};

function busySleep(ms) {
  var startHrTime = process.hrtime();
  for (;;) {
    var durationHrTime = process.hrtime(startHrTime);
    if (durationHrTime[0] * 1000 + durationHrTime[1] / 1000000 >= ms) {
      break;
    }
  }
};

Tinytest.add('server cpu benchmarking - measure without yielding', (test) => {
  const BASE_SLEEP = 100;
  Profile.time("foo1", () => {
    busySleep(BASE_SLEEP);
  });
});


Tinytest.add('server cpu benchmarking - measure with single yield', (test) => {
  const BASE_SLEEP = 100;

  Profile.time("foo2", () => {
    busySleep(BASE_SLEEP);
    sleep(BASE_SLEEP * 2);
    busySleep(BASE_SLEEP * 4);
  });
});


Tinytest.add('server cpu benchmarking - partially overlapping fibers', (test) => {
  const BASE_SLEEP = 100;
  Profile.time("foo4", () => {
    busySleep(BASE_SLEEP);

    Fiber(() => {
      busySleep(BASE_SLEEP * 2);

      Profile.time("bar4", () => {
        busySleep(BASE_SLEEP * 4);
        sleep(BASE_SLEEP * 8);
        busySleep(BASE_SLEEP * 16);
      });
    }).run();
  });
});

Tinytest.add('server cpu benchmarking - nested measure inside new fiber', (test) => {
  // we sleep at multiples of 2^n of this so that when we get counts
  // we'll know how to group them
  const BASE_SLEEP = 1;
  Profile.time("foo3", () => {
    busySleep(BASE_SLEEP);
    sleep(BASE_SLEEP * 2);
    busySleep(BASE_SLEEP * 4);

    Fiber(() => {
      busySleep(BASE_SLEEP * 8);
      sleep(BASE_SLEEP * 16);
      busySleep(BASE_SLEEP * 32);

      Profile.time("bar3", () => {
        busySleep(BASE_SLEEP * 64);
        sleep(BASE_SLEEP * 128);
        busySleep(BASE_SLEEP * 256);
      });

      busySleep(BASE_SLEEP * 512);
      sleep(BASE_SLEEP * 1024);
      busySleep(BASE_SLEEP * 2048);
    }).run();

    busySleep(BASE_SLEEP * 4096);
    sleep(BASE_SLEEP * 8192);
    busySleep(BASE_SLEEP * 16384);
  });
});

