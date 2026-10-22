import assert from "assert";
import { Meteor } from "meteor/meteor";

function assertDeepEqual(a, b) {
  const aWithoutDefault = Object.assign({}, a);
  delete aWithoutDefault.default;

  const bWithoutDefault = Object.assign({}, b);
  delete bWithoutDefault.default;

  assert.deepEqual(aWithoutDefault, bWithoutDefault);
}

describe("dynamic import(...)", function () {
  maybeClearDynamicImportCache();

  it("ignores bad __meteor__/dynamic-import/fetch requests (#10147)", function () {
    // using localhost gives an issue on Windows
    // https://github.com/node-fetch/node-fetch/issues/1624
    // will replace with localhost once the issue is resolved
    // workaround is to use 127.0.0.1 instead of localhost
    const localhost = Meteor.absoluteUrl("/__meteor__/dynamic-import/fetch", {
      replaceLocalhost: true // https://docs.meteor.com/api/core.html#Meteor-absoluteUrl
    });
    return fetch(localhost, {
      // POST request with empty body.
      method: "POST"
    }).then(async (res) => {
      assert.strictEqual(res.status, 400);
      if (Meteor.isProduction) {
        assert.strictEqual(await res.json(), "bad request");
      } else {
        assert.strictEqual(await res.json(), "Unexpected end of JSON input");
      }
    });
  });

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
      assertDeepEqual(console, require(stubId));
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
      assertDeepEqual(priv, require("pri" + "vate"));
    });
  });

  it("dynamic package.json, static package", function () {
    import arson from "arson";
    return import("arson/package.json").then(({ name }) => {
      assert.strictEqual(name, "arson");
      assert.strictEqual(typeof arson.encode, "function");
      assertDeepEqual(arson, require("ar" + "son"));
    });
  });

  it("dynamic package.json, dynamic package", function () {
    return Promise.all([
      import("react/package.json"),
      import("react")
    ]).then(([{ name }, React]) => {
      assert.strictEqual(name, "react");
      assert.strictEqual(typeof React.createElement, "function");
      assertDeepEqual(React, require("re" + "act"));
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

  it("imports from lazy packages", function () {
    let missing = false;
    const dynamicId = [
      "meteor", "lazy-test-package", "dynamic"
    ].join("/");

    try {
      // Synchronous dynamic requires should fail if the module has not
      // been fetched dynamically yet.
      require(dynamicId);
    } catch (e) {
      missing = true;
    }

    if (Meteor.isClient) {
      // Dynamic modules only exist on the client. On the server, modules
      // imported via dynamic import(...) are treated the same as
      // statically imported modules.
      assert.strictEqual(missing, true);
    }

    return Promise.all([
      import("meteor/lazy-test-package").then(lazy => {
        const requiredName = require([
          "meteor", "lazy-test-package"
        ].join("/")).name;

        assert.strictEqual(
          lazy.name,
          "/node_modules/meteor/lazy-test-package/main.js"
        );

        assert.strictEqual(lazy.name, requiredName);
      }),

      import("meteor/lazy-test-package/dynamic").then(async dynamic => {
        assert.strictEqual(
          dynamic.name,
          "/node_modules/meteor/lazy-test-package/dynamic.js"
        );

        // Now the synchronous dynamic require succeeds because the module
        // has been fetched dynamically.
        assert.strictEqual(
          (await require(dynamicId)).name,
          dynamic.name
        );
      })
    ]);
  });

  it("gives dynamic modules access to package variables", async function () {
    const dynamic = await import("meteor/lazy-test-package/dynamic");
    dynamic.checkHelper();

    const a = await import("meteor/helper-package/dynamic/a");
    const b = await import("meteor/helper-package/dynamic/b.coffee");

    assert.strictEqual(a.shared, b.shared);
    assertDeepEqual(a.shared, {
      "/node_modules/meteor/helper-package/dynamic/a.js": true,
      "/node_modules/meteor/helper-package/dynamic/b.coffee": true
    });

    assert.strictEqual(
      (await import("meteor/helper-package")).Helper,
      // Since these tests are defined in an application that uses the
      // global scope for imported package variables, global.Helper should
      // be identical to the Helper symbol exported by helper-package.
      global.Helper
    );
  });

  it("works with module.prefetch(id)", async function () {
    import { shared } from "./imports/prefetch-child";
    assertDeepEqual(shared, {});

    const rejection = module.prefetch("./imports/nonexistent.js");
    let threw = false;
    try {
      await rejection;
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e.message.startsWith("Cannot find module"));
      threw = true;
    }
    assert.strictEqual(threw, true);

    assert.strictEqual(
      await module.prefetch("./tests"),
      "/tests.js"
    );

    return module.prefetch("./imports/prefetch").then(() => {
      assertDeepEqual(shared, {});
    }).then(() => {
      import { name } from "./imports/prefetch.js";
      assert.strictEqual(name, "/imports/prefetch.js");
      assertDeepEqual(shared, { [name]: true });
    });
  });

  it("can import module.exports = {...}-style modules", () => {
    return import("./imports/module-exports-esModule").then(m => {
      assert.strictEqual(typeof m, "object");
      assert.deepEqual(Object.keys(m), []);
    });
  });

  it("should work for package names containing colons", () => {
    const expectedAbsId =
      "/node_modules/meteor/user:colon-name/dynamic.js";

    const version = require(
      "meteor/dynamic-import/dynamic-versions.js"
    ).get(expectedAbsId);

    if (Meteor.isClient) {
      assert.strictEqual(typeof version, "string");
    } else {
      assert.strictEqual(version, null);
    }

    return import("meteor/user:colon-name/dynamic.js").then(dynamic => {
      assert.strictEqual(dynamic.name, expectedAbsId);
    });
  });

  it("should track dynamic peer imports from packages (#9187)", () => {
    const absId = require.resolve("optimism");
    const version = require(
      "meteor/dynamic-import/dynamic-versions.js"
    ).get(absId);

    if (Meteor.isClient) {
      assert.strictEqual(typeof version, "string");
    } else {
      assert.strictEqual(version, null);
    }

    return import("meteor/helper-package/import-peer.js").then(m => {
      assert.strictEqual(typeof m.wrap, "function");
    });
  });

  it('should support object-valued package.json "browser" fields', () => {
    return import("uuid").then(({ v4: uuid }) => {
      const id = uuid();
      assert.strictEqual(typeof id, "string");
      assert.strictEqual(id.split("-").length, 5);

      if (Meteor.isClient) {
        assert.strictEqual(
          require.resolve("uuid/dist/esm-node/index.js"),
          "/node_modules/uuid/dist/esm-browser/index.js"
        );
        const uuidPkgJsonId = ["uuid", "package.json"].join("/");
        const { browser } = require(uuidPkgJsonId);
        assert.strictEqual(typeof browser, "object");
      }
    });
  });
});

function maybeClearDynamicImportCache() {
  if (global.indexedDB) {
    const saveCache = process.env.METEOR_SAVE_DYNAMIC_IMPORT_CACHE;
    if (! (saveCache && JSON.parse(saveCache))) {
      it("cleared the IndexedDB cache", function () {
        return new Promise((resolve, reject) => {
          const deleteRequest =
            global.indexedDB.deleteDatabase("MeteorDynamicImportCache");
          deleteRequest.onerror =
          deleteRequest.onblocked =
          deleteRequest.onsuccess = function (arg) {
            resolve(arg);
            return true;
          };
        });
      });
    }
  }
}
