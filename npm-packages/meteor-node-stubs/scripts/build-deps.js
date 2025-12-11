var fs = require("fs");
var path = require("path");
var depsDir = path.join(__dirname, "..", "deps");
var map = require("../map.json");
var rr = require("rimraf");

// Each file in the `deps` directory expresses the dependencies of a stub.
// For example, `deps/http.js` calls `require("http-browserify")` to
// indicate that the `http` stub depends on the `http-browserify` package.
// This makes it easy for a bundling tool like Browserify, Webpack, or
// Meteor to include the appropriate package dependencies by depending on
// `meteor-node-stubs/deps/http` rather than having to know how the `http`
// stub is implemented. Some modules in the `deps` directory are empty,
// such as `deps/fs.js`, which indicates that no dependencies need to be
// bundled. Note that these modules should not be `require`d at runtime,
// but merely scanned at bundling time.

rr.rimrafSync(depsDir);

fs.mkdirSync(depsDir);

Object.keys(map).forEach(function (id) {
  fs.writeFileSync(
    path.join(depsDir, id + ".js"),
    typeof map[id] === "string"
      ? "require(" + JSON.stringify(map[id]) + ");\n"
      : ""
  );
});
