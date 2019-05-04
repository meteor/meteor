import { invariant } from "ts-invariant";

invariant(
  typeof process.versions.node === "string",
  "Meteor plugins should only run in Node.js",
);

invariant(
  require.resolve("ts-invariant"),
  "/node_modules/meteor/meteor-test-plugin/node_modules/ts-invariant/lib/invariant.js",
);

// This verifies that babel-plugin-transform-strict-mode is enabled.
let expected;
try {
  console.log(arguments.callee.toString());
} catch (e) {
  expected = e;
}
invariant(expected instanceof TypeError);
invariant(/callee/.test(expected.message), expected.message);

Plugin.registerCompiler({
  extensions: ["arson"]
}, () => new ArsonCompiler);

class ArsonCompiler {
  // This verifies that the babel-plugin-transform-class-properties plugin
  // enabled by package.json is respected.
  expectedName = "compile-arson";

  processFilesForTarget(inputFiles) {
    invariant(this.expectedName === "compile-arson", this.expectedName);
    invariant(inputFiles.length > 0);

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
        const base = vueCompilerId.split("/").pop();
        invariant(base === "index.js", base);
        ++vueCheckCount;
      }
    });

    invariant(vueCheckCount > 0);
  }
}
