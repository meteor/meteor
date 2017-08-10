import assert from "assert";

export const name = module.id;

export function checkHelper() {
  assert.strictEqual(typeof Helper, "object");
  assert.strictEqual(Helper.help(), "ok");
}
