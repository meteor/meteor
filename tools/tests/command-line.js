var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var archinfo = require('../archinfo.js');
var release = require('../release.js');

selftest.define("argument parsing", function () {
  var s = new Sandbox;
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
  run = s.run("aoeuasdf", "--version");
  run.matchErr("pass anything else along with --version");
  run.expectExit(1);

  run = s.run("--arch", "--version");
  run.matchErr("pass anything else");
  run.expectExit(1);

  run = s.run("run", "--version");
  run.matchErr("pass anything else");
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

  run = s.run("dummy", "--email", "");
  run.read('"" 3000 none []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "", "");
  run.read('"x" 3000 none ["",""]\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email=");
  run.read('"" 3000 none []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "-e=");
  run.read('"" 3000 none []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "x", "-");
  run.read('"x" 3000 none ["-"]\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "-e", "x");
  run.read('"x" 3000 none []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "-e", "");
  run.read('"" 3000 none []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "-exxx");
  run.read('"xxx" 3000 none []\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email", "-");
  run.read('"-" 3000 none []\n');
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

  run = s.run("dummy", "--email", "--port", "1234", "--changed");
  run.read('"--port" 3000 true ["1234"]\n');
  run.expectEnd();
  run.expectExit(0);

  run = s.run("dummy", "--email=x=y=z", "-Up=3000");
  run.read('"x=y=z" 3000 none []\nurl\n');
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
  run = s.run("dummy", "--email", "x", "-p", "2000", "--port", "2000");
  run.matchErr("can't pass both -p and --port");
  run.expectExit(1);

  // multiple values for an option
  run = s.run("dummy", "--email", "x", "--port", "2000", "--port", "3000");
  run.matchErr("can only take one --port option");
  run.expectExit(1);

  run = s.run("dummy", "--email", "x", "-p", "2000", "-p", "2000");
  run.matchErr("can only take one --port (-p) option");
  run.expectExit(1);

  run = s.run("dummy", "--email", "x", "--changed", "--changed");
  run.matchErr("can only take one --changed option");
  run.expectExit(1);

  // missing option value
  run = s.run("dummy", "--email", "x", "--port");
  run.matchErr("the --port option needs a value");
  run.expectExit(1);

  run = s.run("dummy", "--email");
  run.matchErr("--email option needs a value");
  run.expectExit(1);

  run = s.run("dummy", "-e");
  run.matchErr("--email (-e) option needs a value");
  run.expectExit(1);

  run = s.run("dummy", "--email", "x", "--changed", "-p");
  run.matchErr("the --port (-p) option needs a value");
  run.expectExit(1);

  // non-numeric value for numeric option
  run = s.run("dummy", "--email", "x", "--port", "kitten");
  run.matchErr("--port must be a number");
  run.expectExit(1);

  run = s.run("dummy", "--email", "x", "-p", "1234k");
  run.matchErr("--port (-p) must be a number");
  run.expectExit(1);

  // bad use of =
  run = s.run("dummy", "--=");
  run.readErr("Option names cannot begin with '='.\n");
  run.expectExit(1);

  run = s.run("dummy", "--=asdf");
  run.readErr("Option names cannot begin with '='.\n");
  run.expectExit(1);

  run = s.run("dummy", "-=");
  run.readErr("Option names cannot begin with '='.\n");
  run.expectExit(1);

  run = s.run("dummy", "-ex", "--changed=foo");
  run.matchErr("the --changed option does not need a value.\n");
  run.expectExit(1);

  run = s.run("dummy", "-ex", "-D=foo");
  run.matchErr("the --delete (-D) option does not need a value.\n");
  run.expectExit(1);

  run = s.run("dummy", "-ex", "-UD=foo");
  run.matchErr("the --delete (-D) option does not need a value.\n");
  run.expectExit(1);

  // incorrect number of arguments
  run = s.run("dummy", "--email", "x", "1", "2", "3");
  run.matchErr("too many arguments");
  run.matchErr("Usage: meteor dummy");
  run.expectExit(1);

  run = s.run("bundle");
  run.matchErr("not enough arguments");
  run.matchErr("Usage: meteor bundle");
  run.expectExit(1);

  run = s.run("bundle", "a", "b");
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
  run.matchErr("--port (-p) must be a number");
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

  s.createApp('myapp', 'standard-app');
  s.cd('myapp', function () {
    run = s.run("list", "--using");
    run.expectExit(0);
  });
});


selftest.define("command-like options", function () {
  var s = new Sandbox;
  var run;

  run = s.run("--version");
  if (release.current.isCheckout()) {
    run.matchErr("Unreleased");
    run.expectExit(1);
  } else {
    run.read("Release " + release.current.name + "\n");
    run.expectEnd();
    run.expectExit(0);
  }

  run = s.run("--arch");
  run.read(archinfo.host() + "\n");
  run.expectEnd();
  run.expectExit(0);
});
