Tinytest.addAsync("ecmascript", (test, done) => {
  // Verify that the runtime was installed.
  test.equal(typeof babelHelpers, "object");

  class Base {
    constructor(...args) {
      this.sum = 0;
      args.forEach(arg => this.sum += arg);
    }

    static inherited() {
      return "inherited";
    }
  }

  class Derived extends Base {
    constructor() {
      super(1, 2, 3);
    }
  }

  // Check that static methods are inherited.
  test.equal(Derived.inherited(), "inherited");

  const d = new Derived();
  test.equal(d.sum, 6);

  const expectedError = new Error("expected");

  Promise.resolve("working").then(result => {
    test.equal(result, "working");
    throw expectedError;
  }).catch(error => {
    test.equal(error, expectedError);
    if (Meteor.isServer) {
      var Fiber = Npm.require("fibers");
      // Make sure the Promise polyfill runs callbacks in a Fiber.
      test.instanceOf(Fiber.current, Fiber);
    }
  }).then(done, error => test.exception(error));
});
