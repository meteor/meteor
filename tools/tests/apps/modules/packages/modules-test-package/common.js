import assert from "assert";
import "regenerator-runtime/runtime";
export const ModulesTestPackage = "loaded";

import { parse } from "acorn";
assert.strictEqual(typeof parse, "function");

export function checkWhere(where) {
  const { where: serverWhere } = require("./server/where.js");
  const { where: clientWhere } = require("./client/where.js");
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
