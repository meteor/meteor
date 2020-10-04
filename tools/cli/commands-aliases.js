var main = require('./main.js');
var catalog = require('../packaging/catalog/catalog.js');
var Console = require('../console/console.js').Console;

///////////////////////////////////////////////////////////////////////////////
// Command reminders for those more familiar with Rails
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'server',
  maxArgs: Infinity,
  requiresRelease: false,
  requiresApp: false,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.error("Did you mean " + Console.command("'meteor run'") + "?");
  throw new main.ExitWithCode(1);
});

main.registerCommand({
  name: 'console',
  maxArgs: Infinity,
  requiresRelease: false,
  requiresApp: false,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.error("Did you mean " + Console.command("'meteor shell'") + "?");
  throw new main.ExitWithCode(1);
});

main.registerCommand({
  name: 'new',
  maxArgs: Infinity,
  requiresRelease: false,
  requiresApp: false,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.error("Did you mean " + Console.command("'meteor create'") + "?");
  throw new main.ExitWithCode(1);
});

main.registerCommand({
  name: 'dbconsole',
  maxArgs: Infinity,
  requiresRelease: false,
  requiresApp: false,
  pretty: false,
  catalogRefresh: new catalog.Refresh.Never()
}, function (options) {
  Console.error("Did you mean " + Console.command("'meteor mongo'") + "?");
  throw new main.ExitWithCode(1);
});
