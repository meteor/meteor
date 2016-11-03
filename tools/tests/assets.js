var selftest = require('../tool-testing/selftest.js');

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

function startRun(sandbox) {
  var run = sandbox.run();
  run.match("myapp");
  run.match("proxy");
  run.tellMongo(MONGO_LISTENING);
  run.match("MongoDB");
  return run;
};

// Test that an app can properly read assets with unicode based filenames
selftest.define("assets - unicode asset names are allowed", () => {
  const s = new Sandbox({ fakeMongo: true });
  s.createApp('myapp', 'unicode-asset-app');
  s.cd('myapp');
  const run = startRun(s);
  run.match('1 - getText: Hello world!');
  run.match('2 - getText: Hello world!');
  run.match('3 - getText: Hello world!');
  run.match(/1 - absoluteFilePath:(.*)macaverde.txt/);
  run.match(/2 - absoluteFilePath:(.*)macaverde.txt/);
  run.match(/3 - absoluteFilePath:(.*)macaverde.txt/);
  run.stop();
});
