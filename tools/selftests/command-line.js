
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

  // conflicting command-like options
  run = s.run("--arch", "--version");
  run.matchErr("Can't pass both");
  run.expectExit(1);

  run = s.run("--arch", "--arch");
  run.matchErr("more than once");
  run.expectExit(1);

  // --release takes exactly one value
  run = s.run("--release");
  run.matchErr("needs a value");
  run.expectExit(1);

  run = s.run("--release", "abc", "--release", "def");
  run.matchErr("should only be passed once");
  run.expectExit(1);

  // required option missing
  run = s.run("dummy");
  run.matchErr("option is required");
  run.matchErr("Usage: meteor dummy");
  run.expectExit(1);

  // successful command invocation, correct parsing of arguments
  run = s.run("dummy", "--email", "x");
  run.read('"x" 3000 none []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "--port", "1234", "--changed");
  run.read('"x" 1234 true []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "--port", "0", "true");
  run.read('"x" 0 none ["true"]\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "--port", "01234", "12", "0013");
  run.read('"x" 1234 none ["12","0013"]\n');
  run.expectEnd();
  run.expectExit(0);

  // bad option
  run = s.run("dummy", "--email", "x", "--foo");
  run.matchErr("--foo: unknown option");
  run.expectExit(1);

  run = s.run("dummy", "--email", "x", "-z");
  run.matchErr("-z: unknown option");
  run.expectExit(1);

  // passing short and long options
  run = sApp.run("dummy", "--email", "x", "-p", "2000", "--port", "2000");
  run.matchErr("can't pass both -p and --port");
  run.expectExit(1);

  // multiple values for an option
  run = sApp.run("dummy", "--email", "x", "--port", "2000", "--port", "3000");
  run.matchErr("can only take one --port option");
  run.expectExit(1);

  run = sApp.run("dummy", "--email", "x", "-p", "2000", "-p", "2000");
  run.matchErr("can only take one --port (-p) option");
  run.expectExit(1);

  run = sApp.run("dummy", "--email", "x", "--changed", "--changed");
  run.matchErr("can only take one --changed option");
  run.expectExit(1);

  // missing option value
  run = sApp.run("dummy", "--email", "x", "--port");
  run.matchErr("the --port option needs a value");
  run.expectExit(1);

  run = sApp.run("dummy", "--email", "x", "--changed", "-p");
  run.matchErr("the --port (-p) option needs a value");
  run.expectExit(1);

  // non-numeric value for numeric option
  run = sApp.run("dummy", "--email", "x", "--port", "kitten");
  run.matchErr("--port must be a number");
  run.expectExit(1);

  run = sApp.run("dummy", "--email", "x", "-p", "1234k");
  run.matchErr("--port (-p) must be a number");
  run.expectExit(1);

  // incorrect number of arguments
  run = sApp.run("dummy", "--email", "x", "1", "2", "3");
  run.matchErr("too many arguments");
  run.matchErr("Usage: meteor dummy");
  run.expectExit(1);

  run = sApp.run("bundle");
  run.matchErr("not enough arguments");
  run.matchErr("Usage: meteor bundle");
  run.expectExit(1);

  run = sApp.run("bundle", "a", "b");
  run.matchErr("too many arguments");
  run.matchErr("Usage: meteor bundle");
  run.expectExit(1);

  // '--' to end parsing
  run = s.run("dummy", "--email", "x", "--", "-p", "4000");
  run.read('"x" 3000 none ["-p","4000"]\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "--", "--changed", "--changed");
  run.read('"x" 3000 none ["--changed","--changed"]\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "--");
  run.read('"x" 3000 none []\n');
  run.expectEnd();
  run.expectExit(0);

  // compact short options
  run = s.run("dummy", "--email", "x", "-p4000", "--changed");
  run.read('"x" 4000 true []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "-UD", "--changed");
  run.read('"x" 3000 true []\nurl\n\delete\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "-UDp4000", "--changed");
  run.read('"x" 4000 true []\nurl\ndelete\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "-UDp4000", "--changed");
  run.read('"x" 4000 true []\nurl\ndelete\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "-UDp4000");
  run.read('"x" 4000 none []\nurl\ndelete\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "-UDkp4000", "--changed");
  run.matchErr("-k: unknown option");
  run.expectExit(1);

  run = s.run("dummy", "--email", "x", "-UDp4000k", "--changed");
  run.matchErr("--port (-p) option needs a value");
  run.expectExit(1);

  run = s.run("dummy", "--email", "x", "-UD4000k", "--changed");
  run.matchErr("-4: unknown option");
  run.expectExit(1);

  run = s.run("dummy", "--email", "x", "-UDDp4000", "--changed");
  run.matchErr("one --delete (-D) option");
  run.expectExit(1);

  // requiring an app dir
  run = s.run("list", "--using");
  run.matchErr("not in a Meteor project");
  run.matchErr("meteor create"); // new user help
  run.expectExit(1);

  run = sApp.run("list", "--using");
  run.expectExit(0);
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

"You must specify a Meteor version with --release when you work with this\n" +
"project. It was created from an unreleased Meteor checkout and doesn't\n" +
"have a version associated with it.\n" +
"\n" +
"You can permanently set a release for this project with 'meteor update'.\n");

"=> Running Meteor from a checkout -- overrides project version (%s)\n",


*/