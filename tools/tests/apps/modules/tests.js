import moment from "moment";
import shared from "./imports/shared";

describe("app modules", () => {
  it("can be imported using absolute identifiers", () => {
    assert.strictEqual(require("/tests"), exports);
  });

  it("can have different file extensions", () => {
    assert.strictEqual(
      require("./eager.jsx").extension,
      ".jsx"
    );

    assert.strictEqual(
      require("./eager.coffee").extension,
      ".coffee"
    );
  });

  it("are eagerly evaluated if outside imports/", () => {
    assert.strictEqual(shared["/eager.jsx"], "eager jsx");
    assert.strictEqual(shared["/eager.coffee"], "eager coffee");
  });

  it("are lazily evaluated if inside imports/", (done) => {
    const delayMs = 200;

    setTimeout(() => {
      assert.strictEqual(shared["/imports/lazy1.js"], void 0);
      assert.strictEqual(shared["/imports/lazy2.js"], void 0);

      var reset1 = require("./imports/lazy1").reset;

      assert.strictEqual(shared["/imports/lazy1.js"], 1);
      assert.strictEqual(shared["/imports/lazy2.js"], 2);

      // Make sure this test can run again without starting a new process.
      require("./imports/lazy2").reset();
      reset1();

      done();
    }, delayMs);
  });

  it("cannot import server modules on client", () => {
    let error;
    let result;
    try {
      result = require("./server/only");
    } catch (expectedOnClient) {
      error = expectedOnClient;
    }

    if (Meteor.isServer) {
      assert.strictEqual(typeof error, "undefined");
      assert.strictEqual(result, "/server/only.js");
    }

    if (Meteor.isClient) {
      assert.ok(error instanceof Error);
    }
  });
});

describe("native node_modules", () => {
  Meteor.isServer &&
  it("can be imported on the server", () => {
    assert.strictEqual(typeof require("fs").readFile, "function");
  });

  Meteor.isClient &&
  it("cannot be imported on the client", () => {
    let error;
    try {
      require("fs");
    } catch (expected) {
      error = expected;
    }
    assert.ok(error instanceof Error);
  });
});

describe("local node_modules", () => {
  it("should be importable", () => {
    assert.strictEqual(require("moment"), moment);
    const cal = moment().calendar();
    assert.ok(cal.match(/\bat\b/));
  });

  it("can be imported using absolute identifiers", () => {
    assert.strictEqual(
      require("moment"),
      require("/node_modules/moment")
    );
  });
});

describe("Meteor packages", () => {
  it("should be importable", () => {
    assert.strictEqual(require("meteor/underscore")._, _);

    const Blaze = require("meteor/blaze").Blaze;
    assert.strictEqual(typeof Blaze, "object");

    let error;
    try {
      require("meteor/nonexistent");
    } catch (expected) {
      error = expected;
    }
    assert.ok(error instanceof Error);
  });

  it("can be local", () => {
    assert.strictEqual(ModulesTestPackage, "loaded");
    const mtp = require("meteor/modules-test-package");
    assert.strictEqual(mtp.where, Meteor.isServer ? "server" : "client");
  });
});
