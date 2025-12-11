import assert from "assert";
import "regenerator-runtime/runtime";
export const ModulesTestPackage = "loaded";

import { parse } from "acorn";
assert.strictEqual(typeof parse, "function");

// Test that an npm package with a "module" entry point in its package.json
// file can be imported.
import { Slot } from "@wry/context";
assert.strictEqual(typeof Slot, "function");
const idPrefix = "/node_modules/meteor/modules-test-package/node_modules/@wry/context/lib/";
assert.strictEqual(
  require.resolve("@wry/context"),
  idPrefix + (
    Meteor.isClient && Meteor.isModern ? "context.esm.js" : "context.js"
  ),
);

import ganalytics from "ganalytics";
assert.strictEqual(typeof ganalytics, "function");

export async function checkWhere(where) {
  const { where: serverWhere } = await require("./server/where.js");
  const { where: clientWhere } = await require("./client/where.js");
  assert.strictEqual(serverWhere, where);
  assert.strictEqual(clientWhere, where);
}

export function checkPackageVars() {
  if (Meteor.isClient) {
    assert.strictEqual(ClientPackageVar, "client");
    try {
      console.log(ServerPackageVar);
    } catch (e) {
      if (e instanceof ReferenceError) {
        // ok
      } else {
        throw e;
      }
    }
  } else {
    assert.strictEqual(ServerPackageVar, "server");
    try {
      console.log(ClientPackageVar);
    } catch (e) {
      if (e instanceof ReferenceError) {
        // ok
      } else {
        throw e;
      }
    }
  }
}
