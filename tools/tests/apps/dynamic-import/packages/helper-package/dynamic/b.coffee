localShared = require("./a.js").shared
localShared[module.id] = true
exports.shared = localShared
