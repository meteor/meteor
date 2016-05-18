import assert from "assert";

Plugin.registerCompiler({
  extensions: ["arson"]
}, () => new ArsonCompiler);

class ArsonCompiler {
  processFilesForTarget(inputFiles) {
    inputFiles.forEach(file => {
      assert.strictEqual(file.getPackageJson().name, "compile-arson");

      const arson = file.require("arson");
      let encoded = file.getContentsAsString();
      const decoded = arson.decode(encoded);
      decoded.self = decoded;
      encoded = arson.encode(decoded);

      file.addJavaScript({
        path: file.getPathInPackage(),
        data: 'module.exports = require("arson").decode(' +
          '  ' + JSON.stringify(encoded) + ");",
        hash: file.getSourceHash()
      });
    });
  }
}
