var page = require('webpage').create();
console.log("I am here");
page.onConsoleMessage = function (message) {
  console.log(message);
};
page.open("http://localhost:3000");
setInterval(function () {
  var done = page.evaluate(function () {
    return DONE;
  });
  if (done) {
    phantom.exit(0);
  }
}, 500);
