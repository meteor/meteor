var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("help", function () {
  var s = new Sandbox;

  // Top-level help
  var checkTopLevelHelp = function (run) {
    run.read("Usage: meteor");
    run.match("Commands:");
    run.match(/create\s*Create a new project/);
    run.match(/\s*admin\s/);
    run.expectExit(0);
    run.forbidAll(/^\s*maintainers\s/); // no subcommands
    run.forbidAll(/^\s*dummy\s/); // no hidden commands
  };

  checkTopLevelHelp(s.run("help"));
  checkTopLevelHelp(s.run("--help"));

  // Command help
  var checkCommandHelp = function (run) {
    run.read("Usage: meteor create");
    run.match("create a new Meteor app");
    run.match("Options:");
    run.match(/--list\s*Show list/);
    run.expectExit(0);
  };

  checkCommandHelp(s.run("help", "create"));
  checkCommandHelp(s.run("create", "--help"));
  checkCommandHelp(s.run("--help", "create"));

  // List of subcommands
  var checkSubcommandList = function (run) {
    run.read("Usage: meteor admin <command>");
    run.match("Commands:");
    run.match(/recommend-release\s*Recommend a previously published/);
    run.expectExit(0);
  };
  checkSubcommandList(s.run("help", "admin"));
  checkSubcommandList(s.run("admin", "help"));
  checkSubcommandList(s.run("admin", "--help"));
  checkSubcommandList(s.run("--help", "admin"));

  // Subcommand help
  var checkSubcommandHelp = function (run) {
    run.match("Usage: meteor admin make-bootstrap-tarballs");
    run.match("For internal use only.");
    run.expectExit(0);
  };

  var comm = "make-bootstrap-tarballs";
  checkSubcommandHelp(s.run("help", "admin", comm));
  checkSubcommandHelp(s.run("admin", "help", comm));
  checkSubcommandHelp(s.run("admin", comm, "--help"));
  checkSubcommandHelp(s.run("--help", "admin", comm));
});
