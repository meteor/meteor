import assert from "assert";
import {name as appName} from "./~name~.js";

describe("~name~", () => {
  it("should export its name", () => {
    assert.strictEqual(appName, "~name~");
  });
});
