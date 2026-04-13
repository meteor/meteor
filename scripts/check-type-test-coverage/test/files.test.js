import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { discoverPairs } from "../src/files.js";
import { tmpProject } from "./helpers/tmpProject.js";

describe("discoverPairs", () => {
  test("pairs .test-d.ts files with their sibling .d.ts", (t) => {
    const root = tmpProject(t, {
      "foo.d.ts": "export interface Foo { x: 1 }\n",
      "foo.test-d.ts": "export {};\n",
    });
    const { pairs, orphans } = discoverPairs(root);
    assert.equal(orphans.length, 0);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].dts, path.join(root, "foo.d.ts"));
    assert.equal(pairs[0].test, path.join(root, "foo.test-d.ts"));
  });

  test("collects orphan tests with no sibling .d.ts", (t) => {
    const root = tmpProject(t, {
      "lonely.test-d.ts": "export {};\n",
    });
    const { pairs, orphans } = discoverPairs(root);
    assert.equal(pairs.length, 0);
    assert.deepEqual(orphans, [path.join(root, "lonely.test-d.ts")]);
  });

  test("returns empty result when no test files exist", (t) => {
    const root = tmpProject(t, { "README.md": "no tests here\n" });
    assert.deepEqual(discoverPairs(root), { pairs: [], orphans: [] });
  });

  test("skips node_modules, .git, dist, build, coverage, .meteor", (t) => {
    const root = tmpProject(t, {
      "keep.d.ts": "export interface A { x: 1 }\n",
      "keep.test-d.ts": "export {};\n",
      "node_modules/ignored.test-d.ts": "export {};\n",
      ".git/ignored.test-d.ts": "export {};\n",
      "dist/ignored.test-d.ts": "export {};\n",
      "build/ignored.test-d.ts": "export {};\n",
      "coverage/ignored.test-d.ts": "export {};\n",
      "coverage-ts/ignored.test-d.ts": "export {};\n",
      ".meteor/ignored.test-d.ts": "export {};\n",
    });
    const { pairs, orphans } = discoverPairs(root);
    assert.equal(pairs.length, 1);
    assert.equal(orphans.length, 0);
    assert.equal(pairs[0].test, path.join(root, "keep.test-d.ts"));
  });

  test("result is sorted deterministically across subdirs", (t) => {
    const root = tmpProject(t, {
      "b/b.d.ts": "export interface B { x: 1 }\n",
      "b/b.test-d.ts": "export {};\n",
      "a/a.d.ts": "export interface A { x: 1 }\n",
      "a/a.test-d.ts": "export {};\n",
    });
    const { pairs } = discoverPairs(root);
    const tests = pairs.map((p) => p.test);
    assert.deepEqual(tests, [...tests].sort());
  });
});
