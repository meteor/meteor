import assert from "assert";
import fs from "fs";
import { Meteor as ImportedMeteor } from "meteor/meteor";
import moment from "moment";
import path from "path";
import shared from "./imports/shared";

describe("app modules", () => {
  it("can be imported using absolute identifiers", async () => {
    assert.strictEqual(await require("/tests"), exports);
  });

  it("can have different file extensions", async () => {
    assert.strictEqual(
      (await require("./eager-jsx")).extension,
      ".jsx"
    );

    assert.strictEqual(
      require("./eager-coffee").extension,
      ".coffee"
    );

    assert.strictEqual(
      (await require("/eager-jsx")).extension,
      ".jsx"
    );

    assert.strictEqual(
      require("/eager-coffee").extension,
      ".coffee"
    );
  });

  it("are eagerly evaluated if outside imports/", () => {
    assert.strictEqual(shared["/eager-jsx.jsx"], "eager jsx");
    assert.strictEqual(shared["/eager-coffee.coffee"], "eager coffee");
  });

  it("are lazily evaluated if inside imports/", (done) => {
    const delayMs = 200;

    setTimeout(async () => {
      assert.strictEqual(shared["/imports/lazy1.js"], void 0);
      assert.strictEqual(shared["/imports/lazy2.js"], void 0);

      var reset1 = (await require("./imports/lazy1")).reset;

      assert.strictEqual(shared["/imports/lazy1.js"], 1);
      assert.strictEqual(shared["/imports/lazy2.js"], 2);

      // Make sure this test can run again without starting a new process.
      (await require("./imports/lazy2")).reset();
      reset1();

      done();
    }, delayMs);
  });

  it("cannot import server modules on client", async () => {
    let error;
    let result;
    try {
      result = (await require("./server/only")).default;
    } catch (expectedOnClient) {
      error = expectedOnClient;
    }

    if (Meteor.isServer) {
      assert.strictEqual(typeof error, "undefined");
      assert.strictEqual(result, "/server/only.js");
      assert.strictEqual(await require("./server/only"),
                         await require("/server/only"));
    }

    if (Meteor.isClient) {
      assert.ok(error instanceof Error);
    }
  });

  it("cannot import client modules on server", () => {
    let error;
    let result;
    try {
      result = require("./client/only").default;
    } catch (expectedOnServer) {
      error = expectedOnServer;
    }

    if (Meteor.isClient) {
      assert.strictEqual(typeof error, "undefined");
      assert.strictEqual(result, "/client/only.js");
      assert.strictEqual(require("./client/only"),
                         require("/client/only"));
    }

    if (Meteor.isServer) {
      assert.ok(error instanceof Error);
    }
  });

  it("should have access to filename and dirname", async () => {
    assert.strictEqual(await require(__filename), exports);
    assert.strictEqual(
      require("path").relative(__dirname, __filename),
      "tests.js"
    );
  });

  it("can be implemented by directories", () => {
    assert.strictEqual(
      require("./imports/dir").fellBackTo,
      "/imports/dir/index.js"
    );
  });
});

describe("template modules", () => {
  Meteor.isClient &&
  it("should be importable on the client", () => {
    assert.strictEqual(typeof Template, "function");
    assert.ok(! Object.prototype.hasOwnProperty.call(Template, "lazy"));
    require("./imports/lazy.html");
    assert.ok(Object.prototype.hasOwnProperty.call(Template, "lazy"));
    assert.ok(Template.lazy instanceof Template);
  });

  Meteor.isServer &&
  it("should not be importable on the server", () => {
    let error;
    try {
      require("./imports/lazy.html");
    } catch (expected) {
      error = expected;
    }
    assert.ok(error instanceof Error);
  });
});

Meteor.isClient &&
describe("css modules", () => {
  it("should be loaded eagerly unless lazy", () => {
    assert.strictEqual(
      $(".app-eager-css").css("display"),
      "none"
    );

    // Eager CSS is added unconditionally to a combined <style> tag at the
    // beginning of the <head>. If the corresponding module ever gets
    // imported, its module.exports object should be an empty stub, rather
    // than a <style> node added dynamically to the <head>.
    assert.deepEqual(Object.keys(require("./eager.css")), []);
  });

  it("should be importable by an app", () => {
    assert.strictEqual($(".app-lazy-css").css("padding"), "0px");
    require("./imports/lazy.css");
    assert.strictEqual($(".app-lazy-css").css("padding"), "10px");
  });

  it("should be importable by a package", async () => {
    assert.strictEqual(
      $(".pkg-lazy-css.imported").css("padding"),
      "0px"
    );

    assert.strictEqual(
      $(".pkg-lazy-css.not-imported").css("padding"),
      "0px"
    );

    // Since client.js is a lazy main module, its side effects don't
    // happen until we import it for the first time (here).
    await require("meteor/modules-test-package/client.js");

    assert.strictEqual(
      $(".pkg-lazy-css.imported").css("padding"),
      "20px"
    );

    assert.strictEqual(
      $(".pkg-lazy-css.not-imported").css("padding"),
      "0px"
    );
  });
});

describe("native node_modules", () => {
  Meteor.isServer &&
  it("can be imported on the server", () => {
    assert.strictEqual(typeof require("fs").readFile, "function");
  });

  Meteor.isClient &&
  it("are imported as stubs on the client", () => {
    const inherits = require("util").inherits;
    assert.strictEqual(typeof inherits, "function");
  });

  Meteor.isServer &&
  it("cannot be overridden on the server", () => {
    assert.strictEqual(typeof require("repl").start, "function");
  });

  it("can be implemented by wrapper npm packages", () => {
    const Stream = require("stream");
    assert.strictEqual(typeof Stream, "function");
    assert.strictEqual(typeof Stream.Readable, "function");
  });

  it("can all be imported", () => {
    require("assert");
    require("buffer");
    require("child_process");
    require("cluster");
    require("console");
    require("constants");
    require("dgram");
    require("dns");
    require("domain");
    require("events");
    require("fs");
    require("http");
    require("https");
    require("module");
    require("net");
    require("os");
    require("path");
    require("process");
    require("querystring");
    require("readline");
    require("repl");
    require("stream");
    require("_stream_duplex");
    require("_stream_passthrough");
    require("_stream_readable");
    require("_stream_transform");
    require("_stream_writable");
    require("string_decoder");
    require("sys");
    require("timers");
    require("tls");
    require("tty");
    require("url");
    require("util");
    require("vm");
    require("zlib");

    // The crypto package automatically polyfills global.Buffer on the
    // client, so save it for last to ensure that none of the packages
    // above depend on global.Buffer.
    require("crypto");
  });

  Meteor.isClient &&
  it('should return Module from require("module")', () => {
    assert.ok(module instanceof require("module"));
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

  it("should be importable by packages", () => {
    // Defined in packages/modules-test-package/common.js.
    assert.strictEqual(typeof regeneratorRuntime, "object");
  });

  it('should expose "version" field of package.json', () => {
    const pkg = require("moment/package.json");
    assert.strictEqual(pkg.version, "2.30.1");
  });

  it('should support object-valued package.json "browser" fields', () => {
    const uuid = require("uuid");
    const id = uuid();
    assert.strictEqual(typeof id, "string");
    assert.strictEqual(id.split("-").length, 5);

    if (Meteor.isClient) {
      assert.strictEqual(
        require.resolve("uuid/lib/rng.js"),
        "/node_modules/uuid/lib/rng-browser.js"
      );

      const { browser } = require(["uuid", "package.json"].join("/"));
      assert.strictEqual(typeof browser, "object");
    }
  });

  it('should support package.json without a "main" field', () => {
    if (Meteor.isServer) {
      // Only import mysql during server tests, but register the
      // dependency in the client bundle, too.
      assert.strictEqual(
        typeof require("mysql").createQuery,
        "function"
      );
    }

    assert.strictEqual(
      require.resolve("mysql"),
      "/node_modules/mysql/index.js"
    );

    // Verify that the package.json stub is bundled even though it is not
    // needed for looking up the index.js module (#9235).
    const pkg = require(["mysql", "package.json"].join("/"));
    assert.strictEqual(pkg.name, "mysql");
    assert.strictEqual(pkg.main, void 0);
  });

  it('should support package.json with a directory "main" field', () => {
    if (Meteor.isServer) {
      assert.strictEqual(typeof require("cli-color"), "function");
    }

    assert.strictEqual(
      require.resolve("cli-color"),
      "/node_modules/cli-color/lib/index.js"
    );

    const pkg = require(["cli-color", "package.json"].join("/"));
    assert.strictEqual(pkg.name, "cli-color");
    assert.strictEqual(pkg.main, "lib");

    // We have to use an older version of cli-color to get this unusual
    // module layout, so we shouldn't let this change without notice.
    assert.strictEqual(pkg.version, "0.2.3");
  });

  it('should prefer "module" field of package.json on client', () => {
    assert.strictEqual(
      require.resolve("@wry/context"),
      "/node_modules/@wry/context/lib/" + (
        Meteor.isClient && Meteor.isModern ? "context.esm.js" : "context.js"
      ),
    );

    assert.strictEqual(
      typeof require("@wry/context").Slot,
      "function",
    );
  });

  it("packages with .mjs entry points can be imported", () => {
    assert.strictEqual(
      require.resolve("graphql"),
      "/node_modules/graphql/index." + (
        Meteor.isClient && Meteor.isModern ? "mjs" : "js"
      ),
    );
    const { parse } = require("graphql");
    const nestedParse = require("graphql/language/parser").parse;
    assert.strictEqual(typeof parse, "function");
    assert.strictEqual(parse, nestedParse);
  });

  Meteor.isClient && it("can import @polymer/lit-element", () => {
    // This import is enabled by the meteor.nodeModules.recompile section of
    // the package.json file for the modules test application.
    const litElement = require("@polymer/lit-element");
    const typeofMap = {};
    Object.keys(litElement).forEach(key => {
      typeofMap[key] = typeof litElement[key];
    });

    assert.deepEqual(typeofMap, {
      defaultConverter: "object",
      notEqual: "function",
      UpdatingElement: "function",
      customElement: "function",
      property: "function",
      query: "function",
      queryAll: "function",
      eventOptions: "function",
      html: "function",
      svg: "function",
      TemplateResult: "function",
      SVGTemplateResult: "function",
      supportsAdoptingStyleSheets: "boolean",
      CSSResult: "function",
      css: "function",
      LitElement: "function"
    });
  });

  it("can import @babel/runtime/helpers/esm/*", () => {
    import asyncIterator from "@babel/runtime/helpers/esm/asyncIterator.js";
    import createClass from "@babel/runtime/helpers/esm/createClass.js";
    import getPrototypeOf from "@babel/runtime/helpers/esm/getPrototypeOf.js";
    import inherits from "@babel/runtime/helpers/esm/inherits.js";
    import toArray from "@babel/runtime/helpers/esm/toArray.js";
    import _typeof from "@babel/runtime/helpers/esm/typeof.js";

    assert.strictEqual(typeof asyncIterator, "function");
    assert.strictEqual(typeof createClass, "function");
    assert.strictEqual(typeof getPrototypeOf, "function");
    assert.strictEqual(typeof inherits, "function");
    assert.strictEqual(typeof toArray, "function");
    assert.strictEqual(typeof _typeof, "function");
  });

  it('can import packages with broken "module" fields', () => {
    assert.strictEqual(
      require.resolve("markdown-to-jsx"),
      "/node_modules/markdown-to-jsx/index.es5.js",
    );
    const md2jsx = require("markdown-to-jsx");
    assert.strictEqual(typeof md2jsx.default, "function");

    assert.strictEqual(
      require.resolve("react-trello"),
      "/node_modules/react-trello/dist/index.js",
    );
    const reactTrello = require("react-trello");
    assert.strictEqual(typeof reactTrello.default, "function");
  });
});

describe("Meteor packages", () => {
  it("api.export should create named exports", () => {
    assert.strictEqual(typeof ImportedMeteor, "object");
    assert.strictEqual(Meteor, ImportedMeteor);
  });

  it("should be importable", () => {

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

  it("can be local", async () => {
    // ModulesTestPackage is only api.export-ed on the server.
    if (Meteor.isServer) {
      assert.strictEqual(ModulesTestPackage, "loaded");
    }
    if (Meteor.isClient) {
      assert.strictEqual(typeof ModulesTestPackage, "undefined");
    }

    // But it is importable by both client and server.
    const mtp = await require("meteor/modules-test-package");
    assert.strictEqual(mtp.ModulesTestPackage, "loaded");

    assert.strictEqual(mtp.where, Meteor.isServer ? "server" : "client");
  });

  it("should expose their files for import", async () => {
    const osStub = await require("meteor/modules-test-package/os-stub");

    assert.strictEqual(
      osStub.platform(),
      "browser"
    );

    assert.strictEqual(
      osStub.name,
      "/node_modules/meteor/modules-test-package/os-stub.js"
    );
  });

  it("should only include lazy files if platform uses modules", function () {
    if (Meteor.isServer) {
      const clientOnlyIsopackPath = path.join(
        // Currently process.cwd is .meteor/local/build/programs/server.
        "..", "..", "..", "isopacks", "client-only-ecmascript"
      );

      const webJsonPath = path.join(
        clientOnlyIsopackPath,
        "web.browser.json"
      );

      const osJsonPath = path.join(
        clientOnlyIsopackPath,
        "os.json"
      );

      const web = JSON.parse(fs.readFileSync(webJsonPath));
      assert.deepEqual(web.resources.map(function (res) {
        return res.path;
      }), ["client.js", "imported.js", "server.js"]);
      assert.strictEqual(web.resources[0].fileOptions.mainModule, true);
      assert.strictEqual(web.resources[1].fileOptions.lazy, true);
      assert.strictEqual(web.resources[2].fileOptions.lazy, true);

      const os = JSON.parse(fs.readFileSync(osJsonPath));
      assert.deepEqual(os.resources.map(function (res) {
        return res.path;
      }), ["server.js"]);
      assert.deepEqual(os.resources[0].fileOptions, {
        lazy: false
      });

      assert.deepEqual(ServerTypeof, {
        require: "undefined",
        exports: "undefined"
      });

    } else {
      assert.deepEqual(require("meteor/client-only-ecmascript"), {
        name: "client-only-ecmascript",
        imported: "/node_modules/meteor/client-only-ecmascript/imported.js",
        ClientTypeof: {
          require: "function",
          exports: "object"
        }
      });
    }
  });

  it("can define complex compiler plugins", () => {
    const { one, array } = require("meteor/modules-test-plugin");

    assert.strictEqual(one.string, "one");
    assert.strictEqual(one.number, 1);
    assert.strictEqual(one.self, one)

    assert.strictEqual(array[0], "asdf");
    assert.strictEqual(array[1], array);
    assert.strictEqual(array[2], Infinity);
  });
});

describe("symlinking node_modules", () => {
  it("should allow selective compilation of npm packages", () => {
    import each from "lodash-es/each";
    import range from "lodash-es/range";
    const n = 100;
    let sum = 0;
    each(range(1, n + 1), n => sum += n);
    assert.strictEqual(sum, n * (n + 1) / 2);
  });

  it("should preserve equivalence for require", async () => {
    const pkg1 = require("immutable-tuple/package.json");
    const pkg2 = require("./imports/links/immutable-tuple/package");
    assert.strictEqual(pkg1.author.name, "Ben Newman");
    assert.strictEqual(pkg1.author, pkg2.author);
  });

  it("should preserve equivalence for dynamic import()", async () => {
    const { default: tuple1 } = await import("immutable-tuple/src/tuple");
    const { tuple: tuple2 } =
      await import("/imports/links/immutable-tuple/src/tuple");
    assert.strictEqual(tuple1, tuple2);
  });

  Meteor.isClient &&
  it("should support application-compiled `npm link`ed packages", () => {
    assert.strictEqual(
      require.resolve("acorn"),
      "/node_modules/acorn/src/index.js"
    );
    const { parse } = require("acorn");
    assert.strictEqual(typeof parse, "function");
    assert.strictEqual(
      parse,
      require("./imports/links/acorn").parse
    );
  });

  it("should not break custom import extensions", () => {
    import { jsx } from "jsx-import-test";
    assert.strictEqual(jsx.type, "div");
    assert.strictEqual(jsx.props.children, "oyez");
    return import("./imports/links/jsx-import-test/child").then(ns => {
      assert.strictEqual(ns.default, jsx);
    });
  });
});

describe("issue #9878", () => {
  it("should be fixed by PR #9903", () => {
    const {
      packageJson,
      normalJson,
    } = require("./issue-9878-test-package");

    assert.deepEqual(packageJson, {
      stripped: false,
      nested: {
        stripped: false,
        _stripped: false
      }
    });

    assert.deepEqual(normalJson, {
      stripped: false,
      _stripped: false,
      nested: {
        stripped: false,
        _stripped: false
      }
    });

    assert.deepEqual(require("./issue-9878-test-package/package"), {
      name: "issue-9878-test-package",
      main: "main.js",
      nested: {
        _stripped: false
      }
    });
  });
});

describe("issue #10233", () => {
  it("should be fixed", () => {
    require("meteor/dummy-compiler").check();
  });
});

describe("local .json modules", () => {
  it("should be importable within Meteor packages (issue #10122)", () => {
    import { oyez } from "meteor/import-local-json-module";
    assert.strictEqual(oyez, 1234);
    assert.strictEqual(
      require("meteor/import-local-json-module/data").oyez,
      1234
    );
  });
});

describe("ecmascript miscellany", () => {
  it("JSX should work in .js files on both client and server", () => {
    const React = {
      createElement: function (name, attrs, children) {
        assert.strictEqual(name, "div");
        assert.strictEqual(attrs, null);
        assert.strictEqual(children, "hi");
        return "all good";
      }
    };

    assert.strictEqual(<div>hi</div>, "all good");
  });

  it("async functions should work on the client and server", async () => {
    assert.strictEqual(
      await 2 + 2,
      await new Promise(resolve => resolve(4))
    );
  });

  it("rest paramters in inner arrow functions (#6312)", () => {
    const rev = (...args) => args.reverse();
    assert.deepEqual(rev(1, 2, 3), [3, 2, 1]);
  });

  it("rest parameters in property arrow functions (#6514)", () => {
    const obj = {
      method: (a, b, ...rest) => {
        rest.push(a, b);
        return rest.reverse();
      }
    };

    assert.deepEqual(
      obj.method(1, 2, 3, 4),
      [2, 1, 4, 3]
    );
  });

  it('.babelrc "env" should be respected', () => {
    assert.strictEqual(
      require("./imports/babel-env.js").check(2),
      4
    );
  });

  it("should support plugins like proposal-optional-chaining", () => {
    const { check } = require("./imports/chaining.js");

    assert.strictEqual(check({
      oyez: true
    }), void 0);

    assert.strictEqual(check({
      foo: {
        bar: {
          baz: {
            qux: 1234
          }
        }
      }
    }), 1234);
  });
});

describe("TypeScript", () => {
  it("can be imported", () => {
    const { Test } = require("./typescript");
    assert.strictEqual(typeof Test, "function");
    assert.strictEqual(new Test(1234).value, 1234);
  });
});

Meteor.isClient &&
describe("client/compatibility directories", () => {
  it("should contain bare files", () => {
    assert.strictEqual(topLevelVariable, 1234);
  });
});

describe(".es5.js files", () => {
  it("should not be transpiled", () => {
    assert.strictEqual(require("./imports/plain.es5.js").let, "ok");
  });
});

describe("return statements at top level", () => {
  it("should be legal", () => {
    var ret = require("./imports/return.js");
    assert.strictEqual(ret.a, 1234);
    assert.strictEqual(ret.b, void 0);
  });
});

describe("circular package.json resolution chains", () => {
  it("should be broken appropriately", async () => {
    assert.strictEqual(
      (await require("./lib")).aMain,
      "/lib/a/index.js"
    );
  });
});

describe("imported *.tests.js modules", async () => {
  const { name } = await require("./imports/imported.tests.js");
  it("should be properly compiled", () => {
    assert.strictEqual(name, "imported.tests.js");
  });
});

describe("issue #10409", () => {
  it("should be able to import mobx@5.8.0", () => {
    const { observable, action } = require("mobx");
    assert.strictEqual(typeof observable, "function");
    assert.strictEqual(typeof action, "function");
  });
});

describe("issue #10563", () => {
  it("should be able to import pify@4.0.1 in legacy browsers", () => {
    const pify = require("pify");
    assert.strictEqual(typeof pify, "function");
    const code = Function.prototype.toString.call(pify);
    assert.strictEqual(
      /\bconst\b/.test(code),
      Meteor.isModern,
    );
  });
});
