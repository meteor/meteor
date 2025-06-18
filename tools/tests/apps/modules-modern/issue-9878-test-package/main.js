// Private underscored properties should be stripped from this
// package.json module:
exports.packageJson = require("./dir/package.json");

// But not from this normal.json module:
exports.normalJson = require("./dir/normal.json");
