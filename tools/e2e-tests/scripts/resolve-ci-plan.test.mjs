import test from "node:test";
import assert from "node:assert/strict";

import { resolveCiPlan } from "./resolve-ci-plan.mjs";

const manifest = {
  labels: {
    "ci:e2e": { managed: false, select: [{ group: "all" }] },
    "ci:e2e:apps": { managed: true, select: [{ kind: "app" }] },
    "ci:e2e:skeletons": { managed: true, select: [{ kind: "skeleton" }] },
    "ci:e2e:examples": { managed: true, select: [{ id: "examples" }] }
  },
  pathRules: [
    {
      name: "core-tool",
      paths: [
        "meteor",
        "meteor/**",
        "packages/meteor-tool/**",
        "tools/cli/**",
        "tools/isobuild/**",
        "tools/runners/**",
        "tools/fs/**",
        "tools/packaging/**",
        "tools/tool-env/**",
        "tools/utils/**",
        "tools/console/**",
        "tools/meteor-services/**"
      ],
      select: [{ group: "all" }]
    },
    {
      name: "e2e-examples",
      paths: ["tools/e2e-tests/example.test.js"],
      select: [{ id: "examples" }]
    },
    {
      name: "e2e-babel-test",
      paths: ["tools/e2e-tests/babel.test.js"],
      select: [{ id: "babel-app" }]
    },
    {
      name: "e2e-react-test",
      paths: ["tools/e2e-tests/react.test.js"],
      select: [{ id: "react-app" }]
    },
    {
      name: "skeleton-assets",
      paths: ["tools/static-assets/skel-**"],
      select: [{ kind: "skeleton" }]
    }
  ],
  checks: [
    {
      check: "React",
      slices: [
        {
          id: "react-app",
          kind: "app",
          jestArgs: "--testPathPattern=react.test.js"
        },
        {
          id: "react-skeleton",
          kind: "skeleton",
          jestArgs: "--testPathPattern=skeleton.test.js -t=\"React Skeleton\""
        }
      ]
    },
    {
      check: "Babel",
      slices: [
        {
          id: "babel-app",
          kind: "app",
          jestArgs: "--testPathPattern=babel.test.js"
        },
        {
          id: "babel-skeleton",
          kind: "skeleton",
          jestArgs: "--testPathPattern=skeleton.test.js -t=\"Babel Skeleton\""
        }
      ]
    },
    {
      check: "Examples",
      slices: [
        {
          id: "examples",
          kind: "examples",
          jestArgs: "--testPathPattern=example.test.js"
        }
      ]
    }
  ]
};

function plan(overrides = {}) {
  return resolveCiPlan({
    manifest,
    labels: [],
    changedFiles: [],
    isDraft: false,
    action: "opened",
    addedLabel: null,
    ...overrides
  });
}

function checkNames(matrix) {
  return matrix.include.map((item) => item.check);
}

test("core path selects every slice", () => {
  const result = plan({ changedFiles: ["packages/meteor-tool/foo.js"] });

  assert.equal(result.runE2E, true);
  assert.deepEqual(checkNames(result.realMatrix), ["React", "Babel", "Examples"]);
  assert.deepEqual(result.realMatrix.include, [
    {
      check: "React",
      sliceIds: "react-app,react-skeleton",
      jestArgsJson: JSON.stringify([
        "--testPathPattern=react.test.js",
        "--testPathPattern=skeleton.test.js -t=\"React Skeleton\""
      ])
    },
    {
      check: "Babel",
      sliceIds: "babel-app,babel-skeleton",
      jestArgsJson: JSON.stringify([
        "--testPathPattern=babel.test.js",
        "--testPathPattern=skeleton.test.js -t=\"Babel Skeleton\""
      ])
    },
    {
      check: "Examples",
      sliceIds: "examples",
      jestArgsJson: JSON.stringify(["--testPathPattern=example.test.js"])
    }
  ]);
  assert.deepEqual(result.noopMatrix.include, []);
});

test("babel test path selects only the babel app slice", () => {
  const result = plan({ changedFiles: ["tools/e2e-tests/babel.test.js"] });

  assert.equal(result.runE2E, true);
  assert.deepEqual(result.realMatrix.include, [
    {
      check: "Babel",
      sliceIds: "babel-app",
      jestArgsJson: JSON.stringify(["--testPathPattern=babel.test.js"])
    }
  ]);
  assert.deepEqual(checkNames(result.noopMatrix), ["React", "Examples"]);
});

test("skeleton asset path selects skeleton slices only", () => {
  const result = plan({
    changedFiles: ["tools/static-assets/skel-react/package.json"]
  });

  assert.equal(result.runE2E, true);
  assert.deepEqual(result.realMatrix.include, [
    {
      check: "React",
      sliceIds: "react-skeleton",
      jestArgsJson: JSON.stringify([
        "--testPathPattern=skeleton.test.js -t=\"React Skeleton\""
      ])
    },
    {
      check: "Babel",
      sliceIds: "babel-skeleton",
      jestArgsJson: JSON.stringify([
        "--testPathPattern=skeleton.test.js -t=\"Babel Skeleton\""
      ])
    }
  ]);
  assert.deepEqual(checkNames(result.noopMatrix), ["Examples"]);
});

test("apps label selects only app slices and keeps noop checks", () => {
  const result = plan({
    labels: ["ci:e2e:apps"],
    changedFiles: ["docs/page.md"]
  });

  assert.deepEqual(result.realMatrix.include, [
    {
      check: "React",
      sliceIds: "react-app",
      jestArgsJson: JSON.stringify(["--testPathPattern=react.test.js"])
    },
    {
      check: "Babel",
      sliceIds: "babel-app",
      jestArgsJson: JSON.stringify(["--testPathPattern=babel.test.js"])
    }
  ]);
  assert.deepEqual(checkNames(result.noopMatrix), ["Examples"]);
});

test("skeleton label selects skeleton slices under stable check names", () => {
  const result = plan({
    labels: ["ci:e2e:skeletons"],
    changedFiles: ["docs/page.md"]
  });

  assert.deepEqual(result.realMatrix.include, [
    {
      check: "React",
      sliceIds: "react-skeleton",
      jestArgsJson: JSON.stringify([
        "--testPathPattern=skeleton.test.js -t=\"React Skeleton\""
      ])
    },
    {
      check: "Babel",
      sliceIds: "babel-skeleton",
      jestArgsJson: JSON.stringify([
        "--testPathPattern=skeleton.test.js -t=\"Babel Skeleton\""
      ])
    }
  ]);
  assert.deepEqual(checkNames(result.noopMatrix), ["Examples"]);
});

test("apps and skeleton labels are unioned without duplicate checks", () => {
  const result = plan({
    labels: ["ci:e2e:apps", "ci:e2e:skeletons"],
    changedFiles: ["docs/page.md"]
  });

  assert.deepEqual(checkNames(result.realMatrix), ["React", "Babel"]);
  assert.equal(new Set(checkNames(result.realMatrix)).size, 2);
  assert.deepEqual(result.realMatrix.include, [
    {
      check: "React",
      sliceIds: "react-app,react-skeleton",
      jestArgsJson: JSON.stringify([
        "--testPathPattern=react.test.js",
        "--testPathPattern=skeleton.test.js -t=\"React Skeleton\""
      ])
    },
    {
      check: "Babel",
      sliceIds: "babel-app,babel-skeleton",
      jestArgsJson: JSON.stringify([
        "--testPathPattern=babel.test.js",
        "--testPathPattern=skeleton.test.js -t=\"Babel Skeleton\""
      ])
    }
  ]);
  assert.deepEqual(checkNames(result.noopMatrix), ["Examples"]);
});

test("overlapping label and path selections deduplicate slices", () => {
  const result = plan({
    labels: ["ci:e2e:apps"],
    changedFiles: ["tools/e2e-tests/react.test.js"]
  });

  assert.equal(result.runE2E, true);
  assert.deepEqual(checkNames(result.realMatrix), ["React", "Babel"]);
  assert.equal(
    result.realMatrix.include.filter((item) => item.check === "React").length,
    1
  );
  assert.deepEqual(result.realMatrix.include, [
    {
      check: "React",
      sliceIds: "react-app",
      jestArgsJson: JSON.stringify(["--testPathPattern=react.test.js"])
    },
    {
      check: "Babel",
      sliceIds: "babel-app",
      jestArgsJson: JSON.stringify(["--testPathPattern=babel.test.js"])
    }
  ]);
  assert.deepEqual(checkNames(result.noopMatrix), ["Examples"]);
});

test("examples label selects examples only", () => {
  const result = plan({
    labels: ["ci:e2e:examples"],
    changedFiles: ["docs/page.md"]
  });

  assert.deepEqual(result.realMatrix.include, [
    {
      check: "Examples",
      sliceIds: "examples",
      jestArgsJson: JSON.stringify(["--testPathPattern=example.test.js"])
    }
  ]);
  assert.deepEqual(checkNames(result.noopMatrix), ["React", "Babel"]);
});

test("ci:e2e selects all slices", () => {
  const result = plan({
    labels: ["ci:e2e"],
    changedFiles: ["docs/page.md"]
  });

  assert.equal(result.runE2E, true);
  assert.deepEqual(checkNames(result.realMatrix), ["React", "Babel", "Examples"]);
  assert.deepEqual(JSON.parse(result.realMatrix.include[0].jestArgsJson), [
    "--testPathPattern=react.test.js",
    "--testPathPattern=skeleton.test.js -t=\"React Skeleton\""
  ]);
  assert.deepEqual(result.noopMatrix.include, []);
});

test("draft PR emits noop checks only", () => {
  const result = plan({
    labels: ["ci:e2e"],
    isDraft: true
  });

  assert.equal(result.emitChecks, true);
  assert.equal(result.runE2E, false);
  assert.equal(result.reason, "draft pull request");
  assert.deepEqual(result.realMatrix.include, []);
  assert.deepEqual(checkNames(result.noopMatrix), ["React", "Babel", "Examples"]);
});

test("unrelated label event emits gate only", () => {
  const result = plan({
    labels: ["triage"],
    action: "labeled",
    addedLabel: "triage"
  });

  assert.equal(result.emitChecks, false);
  assert.equal(result.runE2E, false);
  assert.equal(result.reason, "ignored label triage");
  assert.deepEqual(result.realMatrix.include, []);
  assert.deepEqual(result.noopMatrix.include, []);
});

test("managed scoped labels are ignored on synchronize while sticky ci:e2e remains honored", () => {
  const managedOnly = plan({
    labels: ["ci:e2e:apps"],
    changedFiles: ["docs/page.md"],
    action: "synchronize"
  });

  assert.equal(managedOnly.emitChecks, true);
  assert.equal(managedOnly.runE2E, false);
  assert.equal(managedOnly.reason, "no E2E selection");
  assert.deepEqual(managedOnly.realMatrix.include, []);
  assert.deepEqual(checkNames(managedOnly.noopMatrix), ["React", "Babel", "Examples"]);

  const stickyAll = plan({
    labels: ["ci:e2e", "ci:e2e:apps"],
    changedFiles: ["docs/page.md"],
    action: "synchronize"
  });

  assert.equal(stickyAll.runE2E, true);
  assert.deepEqual(checkNames(stickyAll.realMatrix), ["React", "Babel", "Examples"]);
  assert.deepEqual(stickyAll.noopMatrix.include, []);
});

test("synchronize ignores stale managed labels but keeps path rule selections", () => {
  const result = plan({
    labels: ["ci:e2e:apps"],
    changedFiles: ["tools/e2e-tests/example.test.js"],
    action: "synchronize"
  });

  assert.equal(result.runE2E, true);
  assert.equal(result.reason, "selected by path rule: e2e-examples");
  assert.deepEqual(result.realMatrix.include, [
    {
      check: "Examples",
      sliceIds: "examples",
      jestArgsJson: JSON.stringify(["--testPathPattern=example.test.js"])
    }
  ]);
  assert.deepEqual(checkNames(result.noopMatrix), ["React", "Babel"]);
});

test("managed scoped labels are honored when action is labeled, opened, or ready_for_review", () => {
  const cases = [
    { action: "labeled", labels: [], addedLabel: "ci:e2e:apps" },
    { action: "opened", labels: ["ci:e2e:apps"], addedLabel: null },
    { action: "ready_for_review", labels: ["ci:e2e:apps"], addedLabel: null }
  ];

  for (const testCase of cases) {
    const result = plan({
      changedFiles: ["docs/page.md"],
      ...testCase
    });

    assert.equal(result.runE2E, true);
    assert.deepEqual(checkNames(result.realMatrix), ["React", "Babel"]);
    assert.deepEqual(result.realMatrix.include.map((item) => item.sliceIds), [
      "react-app",
      "babel-app"
    ]);
    assert.deepEqual(checkNames(result.noopMatrix), ["Examples"]);
  }
});
