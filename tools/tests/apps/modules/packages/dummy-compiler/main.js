import assert from "assert";
import { id as sourceId } from "./test.dummy";
import { id as secondId } from "./test.dummy.secondModule";

export function check() {
  assert.ok(sourceId.endsWith("/test.dummy"), sourceId);
  assert.ok(secondId.endsWith("/test.dummy.secondModule"), sourceId);
}
