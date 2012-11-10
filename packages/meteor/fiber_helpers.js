Meteor._noYieldsAllowed = function (f) {
  // "Fiber" and "yield" are both in the global namespace. The yield function is
  // at both "yield" and "Fiber.yield". (It's also at require('fibers').yield
  // but that is because require('fibers') === Fiber.)
  var savedYield = Fiber.yield;
  Fiber.yield = function () {
    throw new Error("Can't call yield in a noYieldsAllowed block!");
  };
  global.yield = Fiber.yield;
  try {
    return f();
  } finally {
    Fiber.yield = savedYield;
    global.yield = savedYield;
  }
};
