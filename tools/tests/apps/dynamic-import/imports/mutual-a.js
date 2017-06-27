import { strictEqual } from "assert";
export const name = module.id;
export const promise = import("./mutual-b").then(b => {
  strictEqual(b.name, "/imports/mutual-b.js");
  return b;
});
