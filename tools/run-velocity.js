var Console = require('./console.js').Console;
var isopackets = require("./isopackets.js");

var phantomjs = require('phantomjs');
var child_process = require('child_process');
var _ = require('underscore');

// XXX this could really use a self-test!

// XXX would be nice be nice if this didn't have to be in core. Perhaps
// at some point we'll have an API for packages to register commands in
// the tool.

// 1. Establish a DDP connection to Meteor
// 2. Subscribe to the Velocity subscriptions that tell us
//    which tests pass/fail and when all tests have completed.
// 3. Open the app server with PhantomJS to run client side tests.
// 4. Print the results and exit with the appropriate exit code.
var runVelocity = function (url) {
  var unipackages = isopackets.load('ddp');
  var DDP = unipackages.ddp.DDP;

  // XXX maybe a startup message so users know the tests are running.

  // All running browser processes that visit the mirror pages
  var browserProcesses = [];
  var ddpConnection = DDP.connect(url);

  var killBrowserProcesses = function () {
    browserProcesses.forEach(function (browserProcess) {
      browserProcess.kill('SIGINT');
    });
    browserProcesses = [];
  };

  var interval = setInterval(function () {
    if (ddpConnection.status().status === "connected") {
      clearInterval(interval);

      ddpConnection.subscribe("VelocityTestReports", {
        onError: function () {
          Console.error("failed to subscribe to VelocityTestReports " +
                        "subscription");
          // XXX tell user to add velocity:core
          // XXX these also fire if the user turns on autopublish
        }, onReady: function () {
          this.connection.registerStore("velocityTestReports", {
            update: function (msg) {
              if (msg.msg === "added") {
                var testDesc = msg.fields.framework + " : " +
                      msg.fields.ancestors.join(":") + " => " + msg.fields.name;
                if (msg.fields.result === "passed") {
                  console.log("PASSED", testDesc);
                } else if (msg.fields.result === "failed") {
                  console.error("FAILED", testDesc);
                  console.log(msg.fields.failureStackTrace);
                }
              }
            }
          });
        }
      });

      var reports = {};
      function updateReport(msg) {
        var report = reports[msg.id];
        if (! report) {
          reports[msg.id] = msg.fields;
        } else {
          _.extend(report, msg.fields);
        }
      }
      var aggregateResult = null;
      var isFinished = false;
      ddpConnection.subscribe("VelocityAggregateReports", {
        onError: function () {
          Console.error("failed to subscribe to " +
                        "VelocityAggregateReports subscription");
        }, onReady: function () {
          this.connection.registerStore("velocityAggregateReports", {
            update: function (msg) {
              if (msg.msg === "added" || msg.msg === "changed") {
                updateReport(msg);
                var report = reports[msg.id];

                if (report.name === "aggregateResult") {
                  aggregateResult = report.result;
                }

                if (report.name === "aggregateComplete" &&
                    report.result === "completed") {
                  setTimeout(function () {
                    killBrowserProcesses();
                    if (aggregateResult === "passed") {
                      console.log("TESTS RAN SUCCESSFULLY");
                      // XXX XXX this is not great. We shouldn't be
                      // exiting from deep within code like this. Better
                      // would be to integrate with run --once, and
                      // signal the inner process to exit cleanly on
                      // test completion.
                      process.exit(0);
                    }
                    if (aggregateResult === "failed") {
                      console.log("FAILURE");
                      process.exit(1);
                    }
                  }, 2000);
                }
              }
            }
          });
        }
      });

      function visitWithPhantom (url) {
        var phantomScript = "require('webpage').create().open('" + url + "');";
        var browserProcess = child_process.execFile(
          '/bin/bash',
          ['-c',
           ("exec " + phantomjs.path + " /dev/stdin <<'END'\n" +
            phantomScript + "END\n")]);
        browserProcesses.push(browserProcess);
      }

      ddpConnection.subscribe("VelocityMirrors", {
        onError: function (err) {
          Console.error("failed to subscribe to VelocityMirrors " +
                        "subscription", err);
        }, onReady: function () {
          this.connection.registerStore("velocityMirrors", {
            update: function (msg) {
              if (msg.msg === "added") {
                visitWithPhantom(msg.fields.rootUrl);
              }
            }
          });
        }
      });
    }
  }, 2000);
};

exports.runVelocity = runVelocity;
