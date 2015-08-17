var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var httpHelpers = require('../utils/http-helpers.js');

selftest.define("development error app", function () {
  var s = new Sandbox();
  var run;

  // Starting a run
  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  run = s.run();
  run.match("myapp");
  run.match("proxy");
  run.match("MongoDB");
  run.match("your app");
  run.waitSecs(5);
  run.match("running at");
  run.match("localhost");
  const options = {
  	url: 'http://localhost:3000'
  };

  // Make and HTTP Get request to see regular app is loaded
  const initialResponse = httpHelpers.request(options);

  selftest.expectTrue(!initialResponse.body.includes('development-error-app'));
  selftest.expectTrue(initialResponse.body.includes('<body>\n\n</body>\n</html>\n'));

  // Break the app using a file change
  s.write("empty.js", "asdfsdf");
  run.waitSecs(2);
  run.match("is crashing");


  // Make an HTTP Get request to check if the development error app is loaded
  const response = httpHelpers.request(options);
  selftest.expectTrue(response.body.includes('development-error-app'));

  s.write("empty.js", " ");
  run.waitSecs(2);
  run.match("restarted");

  s.unlink("empty.js");
  run.stop();
});

