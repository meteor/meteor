import { strictEqual } from "assert";
export const name = module.id;
export const promise = import("./mutual-a").then(a => {
  strictEqual(a.name, "/imports/mutual-a.js");
  return a;
});
