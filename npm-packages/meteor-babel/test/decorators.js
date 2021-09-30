"use strict";

import assert from "assert";
import meteorBabel from "../index.js";

describe("@decorators", function () {
  it("legacy @decorators in legacy browsers", function () {
    const babelOptions = meteorBabel.getDefaultOptions({
      react: true,
    });

    babelOptions.plugins = babelOptions.plugins || [];
    babelOptions.plugins.push(
      [require("@babel/plugin-proposal-decorators"), {
        legacy: true
      }]
    );

    const legacyResult = meteorBabel.compile(
      "@dec class A {}",
      babelOptions
    );

    assert.ok(legacyResult.options.parserOpts.plugins
              .includes("decorators-legacy"));

    assert.ok(legacyResult.options.plugins.some(function (plugin) {
      return plugin.key === "regenerator-transform";
    }));

    assert.strictEqual(legacyResult.code.trim(), [
      "var _class;",
      "",
      "var A = dec(_class = function A() {}) || _class;",
    ].join("\n"));
  });

  it("legacy @decorators in modern browsers", function () {
    const babelOptions = meteorBabel.getDefaultOptions({
      react: true,
      modernBrowsers: true
    });

    babelOptions.plugins = babelOptions.plugins || [];
    babelOptions.plugins.push(
      [require("@babel/plugin-proposal-decorators"), {
        legacy: true
      }]
    );

    const legacyResult = meteorBabel.compile(
      "@dec class A {}",
      babelOptions
    );

    assert.ok(legacyResult.options.parserOpts.plugins
              .includes("decorators-legacy"));

    assert.ok(legacyResult.options.plugins.every(function (plugin) {
      return plugin.key !== "regenerator-transform";
    }));

    assert.strictEqual(legacyResult.code.trim(), [
      "var _class;",
      "",
      "let A = dec(_class = class A {}) || _class;",
    ].join("\n"));
  });

  it("legacy @decorators in Node 8", function () {
    const babelOptions = meteorBabel.getDefaultOptions({
      react: true,
      nodeMajorVersion: 8
    });

    babelOptions.plugins = babelOptions.plugins || [];
    babelOptions.plugins.push(
      [require("@babel/plugin-proposal-decorators"), {
        legacy: true
      }]
    );

    const legacyResult = meteorBabel.compile(
      "@dec class A {}",
      babelOptions
    );

    assert.ok(legacyResult.options.parserOpts.plugins
              .includes("decorators-legacy"));

    assert.ok(legacyResult.options.plugins.every(function (plugin) {
      return plugin.key !== "regenerator-transform";
    }));

    assert.ok(legacyResult.options.plugins.some(function (plugin) {
      return plugin.key === "transform-meteor-async-await";
    }));

    assert.strictEqual(legacyResult.code.trim(), [
      "var _class;",
      "",
      "let A = dec(_class = class A {}) || _class;",
    ].join("\n"));
  });
});
