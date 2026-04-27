import assert from "assert";

const ids = [];
export function report(id) {
  ids.push(id);
}

const startupPromise = new Promise(resolve => {
  Meteor.startup(resolve);
});

const hasOwn = Object.prototype.hasOwnProperty;

describe("meteor.settings", () => {
  const config = require("./package.json").meteor;

  it("reflects meteor.settings from package.json in Meteor.settings", async () => {
    await startupPromise;

    // When METEOR_SETTINGS_* env vars are present they intentionally override
    // values from package.json, so skip the strict deep-equality check to
    // avoid false failures from the nesting-override selftest.
    var hasEnvOverrides = Object.keys(process.env).some(function (k) {
      return k.indexOf('METEOR_SETTINGS_') === 0;
    });
    if (hasEnvOverrides) return;

    const expectedSettings = config?.settings || {};
    const expectedPublic = expectedSettings.public || {};

    if (Meteor.isServer) {
      assert.deepEqual(Meteor.settings, {
        ...expectedSettings,
        public: expectedPublic,
      });
    }

    if (Meteor.isClient) {
      assert.deepEqual(Meteor.settings.public, expectedPublic);
    }
  });

  if (Meteor.isServer) {
    it("METEOR_SETTINGS_PUBLIC_* overrides a nested public key and preserves others", async () => {
      await startupPromise;

      // Activated by the selftest that sets METEOR_SETTINGS_PUBLIC_SOMETHING.
      // Verifies:
      //   1. env var value overrides the package.json value for that specific key
      //   2. other public keys from package.json are preserved (deep merge, not replace)
      const envValue = process.env.METEOR_SETTINGS_PUBLIC_SOMETHING;
      if (envValue === undefined) return;

      assert.strictEqual(Meteor.settings.public.something, envValue);

      const pkgPublic = (config && config.settings && config.settings.public) || {};
      Object.keys(pkgPublic).forEach(function (key) {
        if (key === 'something') return;
        assert.strictEqual(
          Meteor.settings.public[key],
          pkgPublic[key],
          `public.${key} should be preserved from package.json`
        );
      });
    });
  }
});

describe("meteor.{mainModule,testModule}", () => {
  // These tests test the consequences of having various meteor.mainModule
  // configurations in package.json.
  const config = require("./package.json").meteor;

  if (Meteor.isClient && Meteor.isAppTest) {
    it("always loads static HTML", () => {
      assert.strictEqual(
        document.getElementsByTagName("h1").item(0).innerText,
        "Welcome to Meteor!"
      );

      assert.strictEqual(
        document.getElementsByTagName("h2").item(0).innerText,
        "Learn Meteor!"
      );

      const listItems = document
        .getElementById("meteor-reading-list")
        .getElementsByTagName("li");
      assert.strictEqual(listItems.length, 4);
    });

    it("always loads CSS resources", () => {
      let { fontWeight } = getComputedStyle(document.body);
      assert(fontWeight === "bold" ||
             fontWeight === "700",
             fontWeight);
    });

    it("always loads LESS styles", () => {
      assert.strictEqual(
        getComputedStyle(document.body)["background-color"],
        "rgb(173, 216, 230)" // #add8e6
      );
    });
  }

  it("loads the right files", async () => {
    await startupPromise;

    if (Meteor.isClient) {
      console.log("client config:", config);
    } else {
      console.log("server config:", config);
    }

    function checkDefaultLoadRules() {
      if (Meteor.isAppTest) {
        assert.deepEqual(ids, [
          "/a.js",
          "/b.js",
          "/c.js",
          Meteor.isClient
            ? "/client/main.js"
            : "/server/main.js"
        ]);
      } else {
        // If we're running `meteor test` without --full-app, non-test
        // modules do not load unless imported by tests.
        assert.deepEqual(ids, []);
      }
    }

    function checkEagerLoadingDisabled() {
      // Eager loading of all modules is disabled.
      assert.deepEqual(ids, []);
    }

    if (! config ||
        ! hasOwn.call(config, "mainModule")) {
      return checkDefaultLoadRules();
    }

    if (config.mainModule === false) {
      return checkEagerLoadingDisabled();
    }

    if (! config.mainModule) {
      return checkDefaultLoadRules();
    }

    let mainId;

    function tryArches(obj, arches) {
      arches.some(arch => {
        if (hasOwn.call(obj, arch)) {
          mainId = obj[arch];
          return true;
        }
      });
    }

    if (Meteor.isClient) {
      tryArches(config.mainModule, ["client", "web"]);
    } else if (Meteor.isServer) {
      tryArches(config.mainModule, ["server", "os"]);
    }

    if (mainId === false) {
      return checkEagerLoadingDisabled();
    }

    if (! mainId || ! Meteor.isAppTest) {
      return checkDefaultLoadRules();
    }

    const absId = require.resolve("./" + mainId);
    const basename = absId.split("/").pop();
    const name = basename.split(".", 1)[0];
    const chars = name.split("");

    assert.deepEqual(
      ids,
      chars.map(ch => "/" + ch + ".js"),
    );
  });
});
