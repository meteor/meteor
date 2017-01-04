var fs = require("fs");
var path = require("path");
var serverJsonPath = path.resolve(process.argv[2]);
module.exports = JSON.parse(
  fs.readFileSync(serverJsonPath, 'utf8').normalize('NFC')
);
