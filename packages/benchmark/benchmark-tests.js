var Fiber = Npm.require('fibers');

function sleep(ms) {
  var fiber = Fiber.current;
  setTimeout(function() {
    fiber.run();
  }, ms);
  Fiber.yield();
};

function busySleep(ms) {
  var start = +new Date;
  while ((+new Date) - start < ms) {}
};

Tinytest.add('measure without yielding', function (test) {
  const BASE_SLEEP = 100;
  measureDuration("foo1", () => {
    busySleep(BASE_SLEEP);
  });

  console.log(getDurations());
});


Tinytest.add('measure with single yield', function (test) {
  const BASE_SLEEP = 100;

  measureDuration("foo2", () => {
    busySleep(BASE_SLEEP);
    sleep(BASE_SLEEP * 2);
    busySleep(BASE_SLEEP * 4);
  });

  console.log(getDurations());
});


Tinytest.add('nested measure inside new fiber', function (test) {
  // we sleep at multiples of 2^n of this so that when we get counts
  // we'll know how to group them
  const BASE_SLEEP = 1;
  measureDuration("foo3", () => {
    busySleep(BASE_SLEEP);
    sleep(BASE_SLEEP * 2);
    busySleep(BASE_SLEEP * 4);

    Fiber(() => {
      busySleep(BASE_SLEEP * 8);
      sleep(BASE_SLEEP * 16);
      busySleep(BASE_SLEEP * 32);

      measureDuration("bar3", () => {
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

  console.log(getDurations());
});

