import assert from "assert";

// Maks sure sharedWithinHelperPackage and __coffeescriptShare are
// declared as variables in the private scope of this package, but not
// defined globally.
assert.strictEqual(sharedWithinHelperPackage, void 0);
assert.strictEqual("sharedWithinHelperPackage" in global, false);
assert.strictEqual(__coffeescriptShare, void 0);
assert.strictEqual("__coffeescriptShare" in global, false);

export const Helper = {
  help() {
    return "ok";
  }
};
