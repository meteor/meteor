import assert from "assert";

const ids = [];
export function report(id) {
  ids.push(id);
}

const startupPromise = new Promise(resolve => {
  Meteor.startup(resolve);
});

const hasOwn = Object.prototype.hasOwnProperty;

describe("meteor.mainModule", () => {
  // These tests test the consequences of having various meteor.mainModule
  // configurations in package.json.
  const config = require("./package.json").meteor;

  if (Meteor.isClient) {
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
      assert.deepEqual(ids, [
        "/a.js",
        "/b.js",
        "/c.js",
        Meteor.isClient
          ? "/client/main.js"
          : "/server/main.js"
      ]);
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

    if (Meteor.isClient) {
      mainId =
        config.mainModule.client ||
        config.mainModule.web;
    } else if (Meteor.isServer) {
      mainId =
        config.mainModule.server ||
        config.mainModule.os;
    }

    if (mainId === false) {
      return checkEagerLoadingDisabled();
    }

    if (! mainId) {
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
