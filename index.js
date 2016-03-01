var map = require("./map.json");
var meteorAliases = {};

Object.keys(map).forEach(function (id) {
  if (typeof map[id] === "string") {
    try {
      exports[id] = meteorAliases[id + ".js"] =
        require.resolve(map[id]);
    } catch (e) {
      // Resolution can fail at runtime if the stub was not included in the
      // bundle because nothing depended on it.
    }
  } else {
    exports[id] = map[id];
    meteorAliases[id + ".js"] = function(){};
  }
});

if (typeof meteorInstall === "function") {
  meteorInstall({
    // Install the aliases into a node_modules directory one level up from
    // the root directory, so that they do not clutter the namespace
    // available to apps and packages.
    "..": {
      node_modules: meteorAliases
    }
  });
}
