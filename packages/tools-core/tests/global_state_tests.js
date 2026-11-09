import {
  getGlobalState,
  setGlobalState,
  removeGlobalState,
  clearGlobalState,
} from "../lib/global-state.js";

// Each test starts from a pristine state, including the "module has never
// been written to" case where the persistentState namespace does not exist.
function resetPersistentState() {
  delete Package.meteor.global.persistentState;
}

Tinytest.add(
  "tools-core - global-state - set then get returns the stored value",
  function (test) {
    // Regression: getGlobalState used to guard on
    // Package.meteor.global[key] while values are only ever written to
    // Package.meteor.global.persistentState[key], so every read returned
    // the default value and stored state was invisible to all consumers.
    resetPersistentState();

    setGlobalState("someKey", "stored");

    test.equal(
      getGlobalState("someKey", "fallback"),
      "stored",
      "get should return the value previously stored with set"
    );
  }
);

Tinytest.add(
  "tools-core - global-state - falsy stored values are returned, not the default",
  function (test) {
    resetPersistentState();

    setGlobalState("boolKey", false);
    setGlobalState("zeroKey", 0);
    setGlobalState("nullKey", null);
    setGlobalState("emptyKey", "");

    test.equal(getGlobalState("boolKey", true), false, "false should round-trip");
    test.equal(getGlobalState("zeroKey", 42), 0, "0 should round-trip");
    test.equal(getGlobalState("nullKey", "default"), null, "null should round-trip");
    test.equal(getGlobalState("emptyKey", "default"), "", "empty string should round-trip");
  }
);

Tinytest.add(
  "tools-core - global-state - missing key returns the default value",
  function (test) {
    resetPersistentState();

    setGlobalState("otherKey", "value");

    test.equal(
      getGlobalState("missingKey", "fallback"),
      "fallback",
      "get should fall back to the default for keys that were never set"
    );
    test.isUndefined(
      getGlobalState("missingKey"),
      "get without a default should return undefined for missing keys"
    );
  }
);

Tinytest.add(
  "tools-core - global-state - get before any set returns the default without throwing",
  function (test) {
    resetPersistentState();

    test.equal(
      getGlobalState("neverSet", "fallback"),
      "fallback",
      "get should work even when the persistentState namespace does not exist yet"
    );
  }
);

Tinytest.add(
  "tools-core - global-state - remove deletes only the given key",
  function (test) {
    resetPersistentState();

    setGlobalState("keepMe", "kept");
    setGlobalState("removeMe", "gone");

    removeGlobalState("removeMe");

    test.equal(
      getGlobalState("removeMe", "fallback"),
      "fallback",
      "removed key should fall back to the default"
    );
    test.equal(
      getGlobalState("keepMe", "fallback"),
      "kept",
      "other keys should be untouched by remove"
    );
  }
);

Tinytest.add(
  "tools-core - global-state - remove before any set does not throw",
  function (test) {
    // Regression: removeGlobalState dereferenced
    // Package.meteor.global.persistentState unconditionally and threw a
    // TypeError when nothing had been stored yet.
    resetPersistentState();

    removeGlobalState("neverSet");

    test.equal(
      getGlobalState("neverSet", "fallback"),
      "fallback",
      "state should still behave normally after a no-op remove"
    );
  }
);

Tinytest.add(
  "tools-core - global-state - clear removes all keys",
  function (test) {
    resetPersistentState();

    setGlobalState("a", 1);
    setGlobalState("b", 2);

    clearGlobalState();

    test.equal(getGlobalState("a", "fallback"), "fallback", "cleared key a");
    test.equal(getGlobalState("b", "fallback"), "fallback", "cleared key b");

    setGlobalState("c", 3);
    test.equal(
      getGlobalState("c", "fallback"),
      3,
      "state should be writable again after clear"
    );
  }
);
