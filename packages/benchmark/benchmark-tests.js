var Fiber = Npm.require('fibers');

function sleep(ms) {
  var fiber = Fiber.current;
  setTimeout(function() {
    fiber.run();
  }, ms);
  Fiber.yield();
};

// Write your tests here!
// Here is an example.
Tinytest.add('nested measure inside new fiber', function (test) {
  // we sleep at multiples of 2^n of this so that when we get counts
  // we'll know how to group them
  const BASE_SLEEP = 250;
  measureDuration("foo", () => {
    sleep(BASE_SLEEP);
    Fiber(() => {
      sleep(BASE_SLEEP * 2);
      measureDuration("bar", () => {
        sleep(BASE_SLEEP * 4);
        Fiber.yield();
        sleep(BASE_SLEEP * 8);
      });
      sleep(BASE_SLEEP * 16);
    }).run();
    sleep(BASE_SLEEP * 32);
  });

  console.log(Durations.durations);
});
