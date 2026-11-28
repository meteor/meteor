const test = require("node:test");
const assert = require("node:assert/strict");
const { isTransientAndroidDriverFailure } = require("./maestro");

test("detects transient Maestro Android driver disconnects", () => {
  assert.equal(
    isTransientAndroidDriverFailure(
      "io.grpc.StatusRuntimeException: UNAVAILABLE\nCaused by: java.io.IOException: Command failed (tcp:7101): closed"
    ),
    true
  );
});

test("does not classify assertion failures as transient driver disconnects", () => {
  assert.equal(
    isTransientAndroidDriverFailure("<failure>Expected text not found</failure>"),
    false
  );
});
