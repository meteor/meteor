import assert from "assert";

describe("dynamic import(...)", function () {
  it("import same module both statically and dynamically", function () {
    import moment from "moment";
    return import("./imports/date").then(date => {
      assert.strictEqual(date.moment, moment);
    });
  });

  it("import builtin stub dynamically", function () {
    const stubId = "console";
    let missing = false;

    try {
      require(stubId);
    } catch (e) {
      missing = true;
    }

    if (Meteor.isClient) {
      assert.strictEqual(missing, true);
    }

    return import("console").then(console => {
      assert.deepEqual(console, require(stubId));
      assert.strictEqual(typeof console.log, "function");
    });
  });

  it("static package.json, static package", function () {
    import { name } from "acorn/package.json";
    import acorn from "acorn";
    assert.strictEqual(name, "acorn");
    assert.strictEqual(typeof acorn.parse, "function");
  });

  it("static package.json, dynamic package", function () {
    import { name } from "private/package.json";
    return import("private").then(priv => {
      assert.strictEqual(name, "private");
      assert.strictEqual(typeof priv.makeAccessor, "function");
      assert.deepEqual(priv, require("pri" + "vate"));
    });
  });

  it("dynamic package.json, static package", function () {
    import arson from "arson";
    return import("arson/package.json").then(({ name }) => {
      assert.strictEqual(name, "arson");
      assert.strictEqual(typeof arson.encode, "function");
      assert.deepEqual(arson, require("ar" + "son"));
    });
  });

  it("dynamic package.json, dynamic package", function () {
    return Promise.all([
      import("react/package.json"),
      import("react")
    ]).then(([{ name }, React]) => {
      assert.strictEqual(name, "react");
      assert.strictEqual(typeof React.createClass, "function");
      assert.deepEqual(React, require("re" + "act"));
    });
  });

  it("mutual dynamic imports", function () {
    return import("./imports/mutual-a").then(a => {
      assert.strictEqual(a.name, "/imports/mutual-a.js");
      return a.promise;
    }).then(b => {
      assert.strictEqual(b.name, "/imports/mutual-b.js");
      return b.promise;
    });
  });
});
