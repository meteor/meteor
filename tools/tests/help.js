var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("help", async function () {
  var s = new Sandbox;
  await s.init();

  // Top-level help
  var checkTopLevelHelp = async function (run) {
    await run.read("Usage: meteor");

    await run.match("Commands:");
    await run.match(/create\s*Create a new project/);
    await run.match(/\s*admin\s/);
    await run.expectExit(0);
    run.forbidAll(/^\s*maintainers\s/); // no subcommands
    run.forbidAll(/^\s*dummy\s/); // no hidden commands
  };

  await checkTopLevelHelp(s.run("help"));
  await checkTopLevelHelp(s.run("--help"));


  // Command help
  var checkCommandHelp = async function (run) {
    await run.read("Usage: meteor create");
    await run.match("create a new Meteor app");
    await run.match("Options:");
    await run.match(/--list\s*Show list/);
    await run.expectExit(0);
  };

  await checkCommandHelp(s.run("help", "create"));
  await checkCommandHelp(s.run("create", "--help"));
  await checkCommandHelp(s.run("--help", "create"));

  // List of subcommands
  var checkSubcommandList = async function (run) {
    await run.read("Usage: meteor admin <command>");
    await run.match("Commands:");
    await run.match(/recommend-release\s*Recommend a previously published/);
    await run.expectExit(0);
  };
  await checkCommandHelp(s.run("create", "--help"));
  await checkSubcommandList(s.run("help", "admin"));
  await checkSubcommandList(s.run("admin", "help"));
  await checkSubcommandList(s.run("admin", "--help"));
  await checkSubcommandList(s.run("--help", "admin"));

  // Subcommand help
  var checkSubcommandHelp = async function (run) {
    await run.match("Usage: meteor admin make-bootstrap-tarballs");
    await run.match("For internal use only.");
    await run.expectExit(0);
  };

  var comm = "make-bootstrap-tarballs";
  await checkSubcommandHelp(s.run("help", "admin", comm));
  await checkSubcommandHelp(s.run("admin", "help", comm));
  await checkSubcommandHelp(s.run("admin", comm, "--help"));
  await checkSubcommandHelp(s.run("--help", "admin", comm));
});
