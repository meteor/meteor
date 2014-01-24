var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var archinfo = require('../archinfo.js');

selftest.define("argument parsing", function () {
  var s = new Sandbox;
  var sApp = new Sandbox({ app: 'empty' });
  var run;

  // bad command
  run = s.run("aoeuasdf");
  run.matchErr("not a Meteor command");
  run.expectExit(1);

  // bad subcommand
  run = s.run("admin", "aoeuasdf");
  run.matchErr("not a Meteor command");
  run.expectExit(1);

  // missing subcommand
  run = s.run("admin");
  run.matchErr("for available commands");
  run.expectExit(1);

  // bad option
  run = s.run("self-test", "--foo");
  run.matchErr("--foo: unknown option");
  run.expectExit(1);

  // conflicting command-like options
  run = s.run("--arch", "--version");
  run.matchErr("Can't pass both");
  run.expectExit(1);

  // passing short and long options
  run = s.run("-p", "2000", "--port", "2000");
  run.matchErr("can't pass both -p and --port");
  run.expectExit(1);

  // XXX at main.js:720

  // command that requires an app
  run = s.run("list", "--using");
  run.matchErr("not in a Meteor project");
  run.matchErr("meteor create"); // new user help
  run.expectExit(1);

  run = sApp.run("list", "--using");
  run.expectExit(0);

  // XXX test that main.js catches all the weird error cases
});


selftest.define("command-like options", function () {
  var s = new Sandbox;
  var run;

  run = s.run("--version");
  run.matchErr("Unreleased"); // XXX XXX
  run.expectExit(1);

  run = s.run("--arch");
  run.read(archinfo.host() + "\n");
  run.expectEnd();
  run.expectExit(0);
});




/*

        "Can't specify a release when running Meteor from a checkout.\n");

"Sorry, this project uses Meteor " + name + ", which is not installed and\n"+
"could not be downloaded. Please check to make sure that you are online.\n");


"Sorry, Meteor " + name + " is not installed and could not be downloaded.\n"+
"Please check to make sure that you are online.\n");

"Problem! This project says that it uses version " + name + " of Meteor,\n" +
"but you don't have that version of Meteor installed and the Meteor update\n" +
"servers don't have it either. Please edit the .meteor/release file in the\n" +
"project and change it to a valid Meteor release.\n");

*/