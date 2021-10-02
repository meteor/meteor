import assert from "assert";

export let value = 0;

export function check({ a, b, ...rest }) {
  value = a + b;
  assert.deepEqual(rest, {});
  assert.strictEqual(value, eval("a + b"));
}
