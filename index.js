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
    node_modules: meteorAliases
  });
}
