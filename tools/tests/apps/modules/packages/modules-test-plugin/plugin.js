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
    });
  }
}
