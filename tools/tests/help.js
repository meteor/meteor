var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("help", function () {
  var s = new Sandbox;

  // Top-level help
  var checkTopLevelHelp = function (run) {
    run.read("Usage: meteor");
    run.match("Commands:");
    run.match(/create\s*Create a new project/);
    run.expectExit(0);
    run.forbidAll(/^\s*admin\s/); // no subcommands
    run.forbidAll(/^\s*dummy\s/); // no hidden commands
  };

  checkTopLevelHelp(s.run("help"));
  checkTopLevelHelp(s.run("--help"));

  // Command help
  var checkCommandHelp = function (run) {
    run.read("Usage: meteor create");
    run.match("create a new Meteor project");
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
    run.match(/grant\s*Grant a permission/);
    run.expectExit(0);
  };
  checkSubcommandList(s.run("help", "admin"));
  checkSubcommandList(s.run("admin", "help"));
  checkSubcommandList(s.run("admin", "--help"));
  checkSubcommandList(s.run("--help", "admin"));

  // Subcommand help
  var checkSubcommandHelp = function (run) {
    run.read("Usage: meteor admin grant");
    run.expectExit(0);
  };

  checkSubcommandHelp(s.run("help", "admin", "grant"));
  checkSubcommandHelp(s.run("admin", "help", "grant"));
  checkSubcommandHelp(s.run("admin", "grant", "--help"));
  checkSubcommandHelp(s.run("--help", "admin", "grant"));
});
