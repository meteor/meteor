var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var utils = require('../utils/utils.js');

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };
var nextAppPort = utils.randomPort() + 20000;

function getAppPort() {
  return nextAppPort++;
}

selftest.define("boot utils", function (options) {
  var bootUtils = require('../static-assets/server/boot-utils.js');
  selftest.expectTrue(bootUtils.validPid(123));
  selftest.expectTrue(bootUtils.validPid("123"));
  selftest.expectTrue(bootUtils.validPid(0x123));
  selftest.expectTrue(bootUtils.validPid("0x123"));

  selftest.expectFalse(bootUtils.validPid("foo123"));
  selftest.expectFalse(bootUtils.validPid("foobar"));
  selftest.expectFalse(bootUtils.validPid("123foo"));
});

selftest.define("Meteor.onShutdown", ["yet-unsolved-windows-failure"], async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp("myapp", "app-prints-pid");
  s.cd("myapp");

  // This catches FIFO execution, skipped hooks after an error, failure to await
  // an async hook, a missing signal argument, and an incorrect exit status.
  s.write("print.js", `
    Meteor.onShutdown(function (signal) {
      console.log("shutdown:first:" + signal);
    });
    Meteor.onShutdown(async function (signal) {
      console.log("shutdown:second:start:" + signal);
      await new Promise(function (resolve) { setTimeout(resolve, 100); });
      console.log("shutdown:second:end:" + signal);
    });
    Meteor.onShutdown(function (signal) {
      console.log("shutdown:third:" + signal);
      Meteor.onShutdown(function (lateSignal) {
        console.log("shutdown:late:" + lateSignal);
      });
      throw new Error("expected shutdown hook failure");
    });
    Meteor.startup(function () {
      console.log("shutdown-ready:" + process.pid);
    });
  `);

  var run = s.run("--once", "--port", getAppPort());
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(30);
  var match = await run.match(/shutdown-ready:(\d+)/);
  process.kill(Number(match[1]), "SIGTERM");
  await run.match("shutdown:third:SIGTERM\n");
  await run.read("shutdown:second:start:SIGTERM\n");
  await run.read("shutdown:late:SIGTERM\n");
  await run.read("shutdown:second:end:SIGTERM\n");
  await run.read("shutdown:first:SIGTERM\n");
  await run.matchErr("expected shutdown hook failure");
  await run.expectExit(143);

  // The bootstrap listener is registered before application listeners. It
  // must yield before exiting so existing synchronous signal cleanup runs.
  s.write("print.js", `
    process.on("SIGTERM", async function () {
      await Promise.resolve();
      console.log("raw-signal-listener-ran");
    });
    Meteor.startup(function () {
      console.log("raw-signal-ready:" + process.pid);
    });
  `);

  run = s.run("--once", "--port", getAppPort());
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(30);
  match = await run.match(/raw-signal-ready:(\d+)/);
  process.kill(Number(match[1]), "SIGTERM");
  await run.match("raw-signal-listener-ran");
  await run.expectExit(143);

  // A malformed timeout must use the documented default, not be partially
  // parsed as a tiny timeout. A second signal must still force an exit.
  s.write("print.js", `
    Meteor.onShutdown(function () {
      return new Promise(function () {});
    });
    Meteor.startup(function () {
      console.log("shutdown-timeout-ready:" + process.pid);
    });
  `);
  for (const invalidTimeout of ["1e999", "2147483648"]) {
    s.set("METEOR_SHUTDOWN_TIMEOUT_MS", invalidTimeout);

    run = s.run("--once", "--port", getAppPort());
    await run.tellMongo(MONGO_LISTENING);
    run.waitSecs(30);
    match = await run.match(/shutdown-timeout-ready:(\d+)/);
    process.kill(Number(match[1]), "SIGTERM");
    await run.matchErr(
      'invalid METEOR_SHUTDOWN_TIMEOUT_MS="' + invalidTimeout +
        '", using default 10000ms'
    );
    process.kill(Number(match[1]), "SIGTERM");
    await run.matchErr("received SIGTERM during shutdown, forcing exit");
    await run.expectExit(143);
  }

  // Exercise the hard-timeout callback without relying on a second signal.
  s.set("METEOR_SHUTDOWN_TIMEOUT_MS", "50");
  run = s.run("--once", "--port", getAppPort());
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(30);
  match = await run.match(/shutdown-timeout-ready:(\d+)/);
  process.kill(Number(match[1]), "SIGTERM");
  await run.matchErr("timeout after 50ms, forcing exit");
  await run.expectExit(143);

  // SIGINT is passed to hooks and maps to the conventional exit status 130.
  s.write("print.js", `
    Meteor.onShutdown(function (signal) {
      console.log("sigint-hook:" + signal);
    });
    Meteor.startup(function () {
      console.log("sigint-ready:" + process.pid);
    });
  `);
  s.unset("METEOR_SHUTDOWN_TIMEOUT_MS");
  run = s.run("--once", "--port", getAppPort());
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(30);
  match = await run.match(/sigint-ready:(\d+)/);
  process.kill(Number(match[1]), "SIGINT");
  await run.match("sigint-hook:SIGINT");
  await run.expectExit(130);

  // With no timeout, a pending Promise is not itself an active Node handle.
  // Remove the app server and parent watchdog so the shutdown runner is solely
  // responsible for keeping the process alive until a second signal arrives.
  s.write(".meteor/packages", "meteor\n");
  s.write("print.js", `
    var parentWatchdog;
    var originalSetInterval = global.setInterval;
    global.setInterval = function (callback, delay, ...args) {
      var timer = originalSetInterval(callback, delay, ...args);
      if (delay === 3000) {
        parentWatchdog = timer;
        console.log("uncapped-shutdown-ready:" + process.pid);
      }
      return timer;
    };
    global.main = async function () {
      return "DAEMON";
    };
    Meteor.onShutdown(function () {
      clearInterval(parentWatchdog);
      return new Promise(function () {});
    });
  `);
  s.set("METEOR_SHUTDOWN_TIMEOUT_MS", "0");

  run = s.run("--once", "--port", getAppPort());
  await run.tellMongo(MONGO_LISTENING);
  run.waitSecs(30);
  match = await run.match(/uncapped-shutdown-ready:(\d+)/);
  process.kill(Number(match[1]), "SIGTERM");
  await utils.sleepMs(250);
  try {
    process.kill(Number(match[1]), 0);
  } catch (e) {
    selftest.fail("uncapped shutdown process exited before a second signal");
  }
  process.kill(Number(match[1]), "SIGTERM");
  await run.matchErr("received SIGTERM during shutdown, forcing exit");
  await run.expectExit(143);
});
