var page = require('webpage').create();
var system = require('system');
var platform = system.args[1] || "";
console.log("I am here");
page.onConsoleMessage = function (message) {
  console.log(message);
};
page.open("http://localhost:3000/" + platform);
setInterval(function () {
  var done = page.evaluate(function () {
    return DONE;
  });
  if (done) {
    phantom.exit(0);
  }
}, 500);
