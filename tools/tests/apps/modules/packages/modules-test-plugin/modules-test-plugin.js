import { strictEqual } from "assert";

// This tests the ./oyez-transform.js plugin, which replaces any "OYEZ"
// string literal with "ASDF".
strictEqual("OYEZ", "ASDF");

export { default as one } from "./one";
export { default as array } from "./array";
