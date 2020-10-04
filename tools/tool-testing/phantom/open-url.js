var system = require('system');
var webpage = require('webpage');

if (system.args.length < 2) {
  throw new Error("Must pass URL argument to this script.");
}

console.log("opening webpage", system.args[1]);

webpage.create().open(system.args[1]);