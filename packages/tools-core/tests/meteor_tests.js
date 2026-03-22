import { inheritMeteorToolNodeFlags } from "../lib/meteor.js";

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
    console.log("--> (meteor_tests.js-Line: 128)\n result: ", result);

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
