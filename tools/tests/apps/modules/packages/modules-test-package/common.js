import assert from "assert";
import "regenerator-runtime/runtime";
export const ModulesTestPackage = "loaded";

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
