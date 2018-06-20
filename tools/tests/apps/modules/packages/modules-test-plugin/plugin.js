import assert from "assert";

// This verifies that babel-plugin-transform-strict-mode is enabled.
let expected;
try {
  console.log(arguments.callee.toString());
} catch (e) {
  expected = e;
}
assert.ok(expected instanceof TypeError);
assert.ok(/callee/.test(expected.message));

Plugin.registerCompiler({
  extensions: ["arson"]
}, () => new ArsonCompiler);

class ArsonCompiler {
  // This verifies that the babel-plugin-transform-class-properties plugin
  // enabled by package.json is respected.
  expectedName = "compile-arson";

  processFilesForTarget(inputFiles) {
    assert.strictEqual(this.expectedName, "compile-arson");
    assert.ok(inputFiles.length > 0);

    let vueCheckCount = 0;

    inputFiles.forEach(file => {
      const arson = file.require("arson");
      let encoded = file.getContentsAsString();
      const decoded = arson.decode(encoded);
      decoded.self = decoded;
      encoded = arson.encode(decoded);

      file.addJavaScript({
        path: file.getPathInPackage() + ".js",
        data: [
          'module.exportDefault(require("arson").decode(',
          "  " + JSON.stringify(encoded),
          "));",
          ""
        ].join("\n"),
        hash: file.getSourceHash()
      });

      if (file.getPackageName() === "modules-test-plugin") {
        const vueCompilerId = file.resolve("vue-template-compiler");
        // Make sure resolution does not use the "browser" field of
        // vue-template-compiler/package.json.
        assert.strictEqual(
          vueCompilerId.split("/").pop(),
          "index.js"
        );
        ++vueCheckCount;
      }
    });

    assert.ok(vueCheckCount > 0);
  }
}
