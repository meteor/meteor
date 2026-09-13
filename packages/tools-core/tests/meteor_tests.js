import {
  captureUserMeteorIgnore,
  getUserMeteorIgnore,
  inheritMeteorToolNodeFlags,
  setMeteorAppIgnore,
  USER_METEOR_IGNORE_KEY,
} from "../lib/meteor.js";
import {
  getGlobalState,
  removeGlobalState,
  setGlobalState,
} from "../lib/global-state.js";

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - no TOOL_NODE_FLAGS",
  function (test) {
    const env = {
      NODE_OPTIONS: "--inspect",
      TOOL_NODE_FLAGS_INHERIT: "true",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result,
      env,
      "Should return input unchanged when no TOOL_NODE_FLAGS"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - default behavior (inherit enabled)",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "--max-old-space-size=4096",
      NODE_OPTIONS: "--inspect",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.TOOL_NODE_FLAGS,
      "--max-old-space-size=4096",
      "TOOL_NODE_FLAGS should be preserved"
    );
    test.equal(
      result.NODE_OPTIONS,
      "--max-old-space-size=4096 --inspect",
      "NODE_OPTIONS should contain both flags"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - inherit explicitly enabled",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "--max-old-space-size=4096",
      NODE_OPTIONS: "--inspect",
      TOOL_NODE_FLAGS_INHERIT: "true",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.NODE_OPTIONS,
      "--max-old-space-size=4096 --inspect",
      "NODE_OPTIONS should contain both flags when explicitly enabled"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - inherit explicitly enabled with truthy value",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "--max-old-space-size=4096",
      NODE_OPTIONS: "--inspect",
      TOOL_NODE_FLAGS_INHERIT: "1",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.NODE_OPTIONS,
      "--max-old-space-size=4096 --inspect",
      "NODE_OPTIONS should contain both flags with truthy string"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - inherit disabled with empty string",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "--max-old-space-size=4096",
      NODE_OPTIONS: "--inspect",
      TOOL_NODE_FLAGS_INHERIT: "",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.NODE_OPTIONS,
      "--inspect",
      "NODE_OPTIONS should remain unchanged when inherit disabled with empty string"
    );
    test.equal(
      result.TOOL_NODE_FLAGS,
      "--max-old-space-size=4096",
      "TOOL_NODE_FLAGS should be preserved"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - inherit disabled with false",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "--max-old-space-size=4096",
      NODE_OPTIONS: "--inspect",
      TOOL_NODE_FLAGS_INHERIT: false,
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.NODE_OPTIONS,
      "--inspect",
      "NODE_OPTIONS should remain unchanged when inherit disabled with false"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - inherit disabled with zero",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "--max-old-space-size=4096",
      NODE_OPTIONS: "--inspect",
      TOOL_NODE_FLAGS_INHERIT: "0",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.NODE_OPTIONS,
      "--inspect",
      'NODE_OPTIONS should remain unchanged when inherit disabled with "0"'
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - no existing NODE_OPTIONS",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "--max-old-space-size=4096",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.NODE_OPTIONS,
      "--max-old-space-size=4096",
      "NODE_OPTIONS should be set to TOOL_NODE_FLAGS when no existing NODE_OPTIONS"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - whitespace handling",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "  --max-old-space-size=4096  ",
      NODE_OPTIONS: "  --inspect  ",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.NODE_OPTIONS,
      "--max-old-space-size=4096 --inspect",
      "Should handle whitespace correctly"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - multiple flags",
  function (test) {
    const env = {
      TOOL_NODE_FLAGS: "--max-old-space-size=4096 --expose-gc",
      NODE_OPTIONS: "--inspect --trace-warnings",
    };
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result.NODE_OPTIONS,
      "--max-old-space-size=4096 --expose-gc --inspect --trace-warnings",
      "Should handle multiple flags correctly"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - empty environment",
  function (test) {
    const env = {};
    const result = inheritMeteorToolNodeFlags(env);

    test.equal(
      result,
      env,
      "Should return input unchanged for empty environment"
    );
  }
);

Tinytest.add(
  "tools-core - inheritMeteorToolNodeFlags - undefined environment",
  function (test) {
    const result = inheritMeteorToolNodeFlags();

    test.equal(
      Object.keys(result).length,
      0,
      "Should return empty object for undefined input"
    );
  }
);

Tinytest.add(
  "tools-core - setMeteorAppIgnore - appends new patterns",
  function (test) {
    const previousIgnore = process.env.METEOR_IGNORE;

    try {
      process.env.METEOR_IGNORE = "node_modules";
      setMeteorAppIgnore("client/*.css");

      test.equal(
        process.env.METEOR_IGNORE,
        "node_modules client/*.css",
        "Should append new ignore patterns"
      );
    } finally {
      if (previousIgnore === undefined) {
        delete process.env.METEOR_IGNORE;
      } else {
        process.env.METEOR_IGNORE = previousIgnore;
      }
    }
  }
);

Tinytest.add(
  "tools-core - setMeteorAppIgnore - keeps last duplicate occurrence",
  function (test) {
    const previousIgnore = process.env.METEOR_IGNORE;

    try {
      process.env.METEOR_IGNORE = "!client/meteor.css";
      setMeteorAppIgnore("client/*.css !client/meteor.css");

      test.equal(
        process.env.METEOR_IGNORE,
        "client/*.css !client/meteor.css",
        "Should preserve the last occurrence so unignore rules can override earlier ignores"
      );
    } finally {
      if (previousIgnore === undefined) {
        delete process.env.METEOR_IGNORE;
      } else {
        process.env.METEOR_IGNORE = previousIgnore;
      }
    }
  }
);

Tinytest.add(
  "tools-core - setMeteorAppIgnore - dedupes repeated patterns to bound growth",
  function (test) {
    const previousIgnore = process.env.METEOR_IGNORE;

    try {
      process.env.METEOR_IGNORE = "client/*.css";
      setMeteorAppIgnore("client/*.css client/*.css");

      test.equal(
        process.env.METEOR_IGNORE,
        "client/*.css",
        "Should avoid growing METEOR_IGNORE when the same pattern is appended repeatedly"
      );
    } finally {
      if (previousIgnore === undefined) {
        delete process.env.METEOR_IGNORE;
      } else {
        process.env.METEOR_IGNORE = previousIgnore;
      }
    }
  }
);

Tinytest.add(
  "tools-core - getUserMeteorIgnore - is unaffected by setMeteorAppIgnore",
  function (test) {
    const previousIgnore = process.env.METEOR_IGNORE;
    const userIgnore = getUserMeteorIgnore();

    try {
      process.env.METEOR_IGNORE = "*.tests.ts";
      setMeteorAppIgnore("client/*.css");

      test.equal(
        getUserMeteorIgnore(),
        userIgnore,
        "Should keep reporting the patterns the user set, not the ones meteor-tool appends"
      );
    } finally {
      if (previousIgnore === undefined) {
        delete process.env.METEOR_IGNORE;
      } else {
        process.env.METEOR_IGNORE = previousIgnore;
      }
    }
  }
);

Tinytest.add(
  "tools-core - captureUserMeteorIgnore - keeps the value from before setMeteorAppIgnore grew it",
  function (test) {
    const previousIgnore = process.env.METEOR_IGNORE;
    const previousCapture = getGlobalState(USER_METEOR_IGNORE_KEY);

    try {
      // Model the build-plugin sequence: the author's value, then meteor-tool
      // grows it, then a later Isopack instance re-evaluates lib/meteor.js.
      process.env.METEOR_IGNORE = "author/*.ts";
      removeGlobalState(USER_METEOR_IGNORE_KEY);
      captureUserMeteorIgnore();

      setMeteorAppIgnore("/_build /_build-*");
      test.notEqual(
        process.env.METEOR_IGNORE,
        "author/*.ts",
        "Precondition: setMeteorAppIgnore should have grown METEOR_IGNORE"
      );

      captureUserMeteorIgnore();

      // Asserted against the author's literal value rather than against an
      // earlier read: comparing two reads passes even when nothing is stored
      // at all, since both are then the empty default.
      test.equal(
        getUserMeteorIgnore(),
        "author/*.ts",
        "Should still report the value captured before setMeteorAppIgnore grew it"
      );
    } finally {
      if (previousCapture === undefined) {
        removeGlobalState(USER_METEOR_IGNORE_KEY);
      } else {
        setGlobalState(USER_METEOR_IGNORE_KEY, previousCapture);
      }
      if (previousIgnore === undefined) {
        delete process.env.METEOR_IGNORE;
      } else {
        process.env.METEOR_IGNORE = previousIgnore;
      }
    }
  }
);
