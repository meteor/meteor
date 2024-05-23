var selftest = require('../tool-testing/selftest.js');
import { getUrl } from '../utils/http-helpers.js';

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

function startRun(sandbox) {
  var run = sandbox.run();
  run.waitSecs(90); // Running from checkout can take a _long_ time
  run.match("myapp");
  run.match("proxy");
  run.tellMongo(MONGO_LISTENING);
  // Since the "=> Started MongoDB" message can appear after the
  // "Attributes on <head> are not supported" message, we should not
  // enforce the opposite order here:
  // run.match("MongoDB");
  return run;
};

// Test that the static-html package works. It's hard to do this from a unit
// test.
selftest.define("static-html - add static content to head and body", () => {
  const s = new Sandbox({ fakeMongo: true });

  s.createApp('myapp', 'compiler-plugin-static-html');
  s.cd('myapp');

  const run = startRun(s);

  // Test that static content is present in HTML response.
  const html = getUrl('http://localhost:3000/');
  selftest.expectTrue(
    html.indexOf(
      `<meta name="viewport" content="width=device-width, initial-scale=1">`
    ) !== -1
  );

  selftest.expectTrue(
    html.indexOf(
      `<div>I have a body, yet no Blaze!</div>`
    ) !== -1
  );

  run.stop();
});

// Test that the static-html package throws the right error
selftest.define("static-html - throws error", () => {
  const s = new Sandbox({ fakeMongo: true });

  s.createApp('myapp', 'compiler-plugin-static-html-error');
  s.cd('myapp');

  const run = startRun(s);
  run.match("Attributes on <head> not supported");
  run.waitSecs(30);

  run.stop();
});
