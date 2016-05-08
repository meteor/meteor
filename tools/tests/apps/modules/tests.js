import assert from "assert";
import moment from "moment";
import shared from "./imports/shared";
import {Meteor as ImportedMeteor} from "meteor/meteor";

describe("app modules", () => {
  it("can be imported using absolute identifiers", () => {
    assert.strictEqual(require("/tests"), exports);
  });

  it("can have different file extensions", () => {
    assert.strictEqual(
      require("./eager-jsx").extension,
      ".jsx"
    );

    assert.strictEqual(
      require("./eager-coffee").extension,
      ".coffee"
    );

    assert.strictEqual(
      require("/eager-jsx").extension,
      ".jsx"
    );

    assert.strictEqual(
      require("/eager-coffee").extension,
      ".coffee"
    );
  });

  it("are eagerly evaluated if outside imports/", () => {
    assert.strictEqual(shared["/eager-jsx.jsx"], "eager jsx");
    assert.strictEqual(shared["/eager-coffee.coffee.js"], "eager coffee");
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
      result = require("./server/only").default;
    } catch (expectedOnClient) {
      error = expectedOnClient;
    }

    if (Meteor.isServer) {
      assert.strictEqual(typeof error, "undefined");
      assert.strictEqual(result, "/server/only.js");
      assert.strictEqual(require("./server/only"),
                         require("/server/only"));
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

  it("should not be parsed in strictMode", () => {
    let foo = 1234;
    delete foo;
  });

  it("should have access to filename and dirname", () => {
    assert.strictEqual(require(__filename), exports);
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
    assert.ok(! _.has(Template, "lazy"));
    require("./imports/lazy.html");
    assert.ok(_.has(Template, "lazy"));
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
    assert.deepEqual(require("./eager.css"), {});
  });

  it("should be importable by an app", () => {
    assert.strictEqual($(".app-lazy-css").css("padding"), "0px");
    require("./imports/lazy.css");
    assert.strictEqual($(".app-lazy-css").css("padding"), "10px");
  });

  it("should be importable by a package", () => {
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

  Meteor.isClient &&
  it("can be overridden on the client", () => {
    assert.strictEqual(require("repl").notEmpty, true);
  });

  it("can be implemented by wrapper npm packages", () => {
    const Stream = require("stream");
    assert.strictEqual(typeof Stream, "function");
    assert.strictEqual(typeof Stream.Readable, "function");
  });

  it("can all be imported", () => {
    require("_stream_duplex");
    require("_stream_passthrough");
    require("_stream_readable");
    require("_stream_transform");
    require("_stream_writable");
    require("assert");
    require("buffer");
    require("child_process");
    require("cluster");
    require("console");
    require("constants");
    require("crypto");
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
    require("punycode");
    require("querystring");
    require("readline");
    require("repl");
    require("stream");
    require("string_decoder");
    require("sys");
    require("timers");
    require("tls");
    require("tty");
    require("url");
    require("util");
    require("vm");
    require("zlib");
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
    assert.strictEqual(pkg.version, "2.11.1");
  });
});

describe("Meteor packages", () => {
  it("api.export should create named exports", () => {
    assert.strictEqual(typeof ImportedMeteor, "object");
    assert.strictEqual(Meteor, ImportedMeteor);
  });

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

  it("should expose their files for import", () => {
    const osStub = require("meteor/modules-test-package/os-stub");

    assert.strictEqual(
      osStub.platform(),
      "browser"
    );

    assert.strictEqual(
      osStub.name,
      "/node_modules/meteor/modules-test-package/os-stub.js"
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
    assert.ok(rev.toString().match(/\barguments\b/));
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
  it("should be broken appropriately", () => {
    assert.strictEqual(
      require("./lib").aMain,
      "/lib/a/index.js"
    );
  });
});
