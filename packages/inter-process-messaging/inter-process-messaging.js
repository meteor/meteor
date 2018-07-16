const parent = require("./parent.js");
exports.enableSendMessage = parent.enableSendMessage;

const child = require("./child.js");
exports.onMessage = child.onMessage;
