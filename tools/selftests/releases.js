var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("smoke", function () {
  var s = new Sandbox({
    warehouse: {
      v1: { tools: 'tools1', notices: ["kitten"] },
      v2: { tools: 'tools2', notices: ["puppies"], upgraders: ["cats"],
            latest: true }}
  });

  console.log("shaZAM");
  while(true) { }

});
