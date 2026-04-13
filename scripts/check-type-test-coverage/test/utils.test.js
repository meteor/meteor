import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";

import { lineOf, relOrAbs, colorize } from "../src/utils.js";

describe("utils", () => {
  describe("lineOf", () => {
    test("returns 1-based line number for an AST node", () => {
      const source = ts.createSourceFile(
        "x.ts",
        "const a = 1;\nconst b = 2;\nconst c = 3;",
        ts.ScriptTarget.Latest,
        true
      );
      const [first, second, third] = source.statements;
      assert.equal(lineOf(source, first), 1);
      assert.equal(lineOf(source, second), 2);
      assert.equal(lineOf(source, third), 3);
    });
  });

  describe("relOrAbs", () => {
    test("returns relative path for files inside cwd", () => {
      const inside = path.join(process.cwd(), "some", "nested", "file.ts");
      assert.equal(relOrAbs(inside), path.join("some", "nested", "file.ts"));
    });

    test("returns the absolute path when outside cwd", () => {
      const outside = path.resolve("/", "totally", "elsewhere", "file.ts");
      assert.equal(relOrAbs(outside), outside);
    });
  });

  describe("colorize", () => {
    test("100 uses green", () => {
      const out = colorize(100, "ok");
      assert.match(out, /\u001b\[32m/);
      assert.match(out, /ok/);
    });

    test(">=50 uses yellow", () => {
      assert.match(colorize(50, "x"), /\u001b\[33m/);
      assert.match(colorize(99, "x"), /\u001b\[33m/);
    });

    test("<50 uses red", () => {
      assert.match(colorize(0, "x"), /\u001b\[31m/);
      assert.match(colorize(49, "x"), /\u001b\[31m/);
    });
  });
});
