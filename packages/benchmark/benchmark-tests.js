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
  Profile.time("test1", () => {
    busySleep(BASE_SLEEP);
  });
});


Tinytest.add('server cpu benchmarking - measure with single yield', (test) => {
  const BASE_SLEEP = 100;

  Profile.time("test2", () => {
    busySleep(BASE_SLEEP);
    sleep(BASE_SLEEP * 2);
    busySleep(BASE_SLEEP * 4);
  });
});


Tinytest.add('server cpu benchmarking - partially overlapping fibers', (test) => {
  const BASE_SLEEP = 100;
  Profile.time("test3.a", () => {
    busySleep(BASE_SLEEP);

    Fiber(Profile("test3.a", () => {
      busySleep(BASE_SLEEP * 2);

      Profile.time("test3.b", () => {
        busySleep(BASE_SLEEP * 4);
        sleep(BASE_SLEEP * 8);
        busySleep(BASE_SLEEP * 16);
      });
    })).run();
  });
});

Tinytest.add('server cpu benchmarking - nested measure inside new fiber', (test) => {
  // we sleep at multiples of 2^n of this so that when we get counts
  // we'll know how to group them
  const BASE_SLEEP = 1;
  Profile.time("test4.a", () => {
    busySleep(BASE_SLEEP);
    sleep(BASE_SLEEP * 2);
    busySleep(BASE_SLEEP * 4);

    Fiber(Profile("test4.a", () => {
      busySleep(BASE_SLEEP * 8);
      sleep(BASE_SLEEP * 16);
      busySleep(BASE_SLEEP * 32);

      Profile.time("test4.b", () => {
        busySleep(BASE_SLEEP * 64);
        sleep(BASE_SLEEP * 128);
        busySleep(BASE_SLEEP * 256);
      });

      busySleep(BASE_SLEEP * 512);
      sleep(BASE_SLEEP * 1024);
      busySleep(BASE_SLEEP * 2048);
    })).run();

    busySleep(BASE_SLEEP * 4096);
    sleep(BASE_SLEEP * 8192);
    busySleep(BASE_SLEEP * 16384);
  });
});

