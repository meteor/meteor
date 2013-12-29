var showRequireProfile = ('METEOR_PROFILE_REQUIRE' in process.env);
if (showRequireProfile)
  require('./profile-require.js').start();

var _ = require('underscore');
var Fiber = require('fibers');
var files = require('./files.js');
var path = require('path');
var logging = require('./logging.js');
var warehouse = require('./warehouse.js');
var library = require('./library.js');
var optimist = require('optimist');
var fs = require('fs');

var main = exports;

///////////////////////////////////////////////////////////////////////////////
// Command registration
///////////////////////////////////////////////////////////////////////////////

var Command = function (options) {
  this.name = options.name;
  this.minArgs = options.minArgs || 0;
  this.maxArgs = this.minArgs || 0;
  this.options = options.options || {};
  this.raw = options.raw || false;
  this.hidden = options.hidden || false;
  this.func = options.func;

  _.each(this.options, function (value, key) {
    if (! _.has(value, 'type'))
      value.type = String;
    if (_.has(value, 'default') && _.has(value, 'required'))
      throw new Error(options.name + ": " + key + " can't be both optional " +
                      "and required");
  });
};

// map from command name to a Command, or to a subcommand map (a map
// of subcommand names to either Commands or further submaps).
//
// Options that function as commands (eg, "meteor --arch") are treated
// as subcommands of "--".
var commands = {};

// map from full command name ('deploy' or 'admin grant') to
// - description: one-line help message, for use in command list
// - usage: full usage help. ends with a newline but no blank lines
var messages = {};

// Exception to throw from a command to bail out and show command
// usage information.
main.ShowUsage = function () {};

// Register a command-line command.
//
// options:
// - name
//   - can be a basic command, like "deploy"
//   - can be a subcommand, like "admin grant"
//     (distinguished by presence of ' ')
//   - can be a an option that functions as a command, ilke "--arch"
//     (distinguisged by starting with '--')
// - minArgs: minimum non-option arguments that can be present (default 0)
// - maxArgs: maximum non-option arguments that can be present (defaults to
//   whatever value you passed for minArgs; use Infinity for unlimited)
// - options: map from long option name to..
//   - type: String, Number, or Boolean. default is String. a future
//     version could support [String] and [Number] to allow the option to
//     be passed more than once, but we don't do that yet.
//   - short: single character short alias (eg, 'p' for 'port', to do -p 3000)
//   - default: value to use if none supplied
//   - required: true if required (incompatible with 'default')
// - raw: if true, option parsing is completely skipped (including
//   --release and --help). To be activated the command will need to be
//   literally the first argument, and it will need to do its own option
//   parsing from process.argv.
// - hidden: do not show in command list in help
//
// An error will be printed if an unrecognized option is passed on the
// command line (eg, '--foo' when you don't have a 'foo' key in
// options.options), or a required option is missing, or the number of
// other arguments isn't as required by minArgs / maxArgs.
//
// func: function to call when the command is chosen. receives one
// argument, an options dictionary that contains:
// - the values of any 'options' that were provided
// - args: an array of the other command-line arguments
// - context: the famous 'context' object, formerly global, as
//   returned by calculateContext()
//
// func should do one of the following:
// - On success, return undefined. This indicates successful
//   completion, and the program will exit with status 0.
// - On failure, return a number. The program will exit with that
//   status.
// - If the command-line arguments aren't valid, 'throw new
//   main.ShowUsage'. This will print usage info for the command and
//   exit with status 1.
//
// Commands should never call process.exit()! They should instead
// return an appropriate value.

main.registerCommand = function (options, func) {
  options = _.clone(options);
  options.func = func;

  var nameParts = options.name.trim().split(/\s+/);
  options.name = nameParts.join(' ');

  if (nameParts[0].indexOf('--') === 0) {
    // "--foo" -> "--" "foo"
    nameParts[0] = nameParts[0].substr(2);
    nameParts.unshift('--');
  }

  if (nameParts.length !== 1 && options.raw)
    throw new Error("raw mode can't be used with subcommands or --commands");

  var target = commands;
  while (nameParts.length > 1) {
    var part = nameParts.shift();
    if (! _.has(target, part))
      target[part] = {};
    target = target[part];
  }
  target[nameParts[0]] = new Command(options);
};

///////////////////////////////////////////////////////////////////////////////
// Load all the commands
///////////////////////////////////////////////////////////////////////////////

// NB: files required up to this point may not define commands

require('./commands.js');

///////////////////////////////////////////////////////////////////////////////
// Determining the Meteor version
///////////////////////////////////////////////////////////////////////////////

var setReleaseVersion = function (context, version) {
  context.releaseVersion = version;

  try {
    context.releaseManifest =
      warehouse.ensureReleaseExistsAndReturnManifest(context.releaseVersion);
  } catch (e) {
    if (!(e instanceof files.OfflineError))
      throw e;
    if (context.appDir && !context.userReleaseOverride) {
      logging.die(
"Sorry, this project uses Meteor " + version + ", which is not installed and\n"+
"could not be downloaded. Please check to make sure that you are online.");
    } else {
      logging.die(
"Sorry, Meteor " + version + " is not installed and could not be downloaded.\n"+
"Please check to make sure that you are online.");
      }
    }

  var localPackageDirs = [];
  if (context.appDir)
    // If we're running from an app (as opposed to a global-level
    // "meteor test-packages"), use app packages.
    localPackageDirs.push(path.join(context.appDir, 'packages'));

  // Let the user provide additional package directories to search
  // in PACKAGE_DIRS (colon-separated.)
  if (process.env.PACKAGE_DIRS)
    localPackageDirs.push.apply(localPackageDirs,
                                process.env.PACKAGE_DIRS.split(':'));

  // If we're running out of a git checkout of meteor, use the packages from
  // the git tree.
  if (!files.usesWarehouse())
    localPackageDirs.push(path.join(files.getCurrentToolsDir(), 'packages'));

  context.library = new library.Library({
    localPackageDirs: localPackageDirs,
    releaseManifest: context.releaseManifest
  });
};

// Figures out if we're in an app dir, what release we're using, etc. May
// download the release if necessary.
//
// Terminates the program if the user passed --release and we are in a
// checkout (as this is not allowed).
//
// Keys in context:
//
// - appDir: if 'meteor' was run from inside a project (a project has a file
//   .meteor/packages), the absolute path to the top-level project directory
//
// - releaseVersion: the actual Meteor release that we are now
//   using. if running from a checkout, "none". else we have a
//   release, either from --release on the command line, the release
//   that the app has if we're in an app, or else if not in an app (or
//   in a really old legacy app with no .meteor/release), the latest
//   release in the warehouse.
//
// - releaseManifest: the parsed release manifest (the .json control
//   file) for releaseVersion. null if running from a checkout.
//
// - library: a library.Library (a package resolver/lister/cache)
//   pointed at releaseVersion (ie, either that manifest in the
//   warehouse or the checkout tree), plus any app packages, plus any
//   package directories from PACKAGE_DIRS. basically, this is your
//   handle to actually load, list, or otherwise work with packages.
//   => some commands mutate the library (by installing
//      overrides). that's kind of messy; would be nice to find a
//      better pattern.
//
// - userReleaseOverride: true if --release was passed (that is, if
//   we're using this release because the user forced us to, rather
//   than because the project said to). this is only used once, to
//   change an error message
//
// - appReleaseVersion: the release that this app uses. not set if not
//   in an app. if the app is a super old app that doesn't have a
//   .meteor/release, the latest release in the warehouse, or
//   (curiously?) 'none' if running from a checkout (the latter seems
//   like a fine reason to just bail out)
//
// - globalReleaseVersion: the release that we would be using if we
//   weren't in an app dir. (in installed meteor, either the --release
//   the user explicitly specified or else the latest release in the
//   warehouse; or "none" in a checkout).
//
// - galaxy: set by setGalaxyContext, called only by prepareForGalaxy,
//   called only by galaxyCommand, which is needlessly asynchronous
//   (it could as easily block) and needlessly passes its result out
//   in a global variable (context.galaxy) -- the whole thing could as
//   easily be a blocking function discoverGalaxy(sitename) which
//   returns null if not using galaxy or else this galaxy context info
//   - url
//   - adminBaseUrl
//   - authToken
//
// Arguments to calculateContext:
// - releaseOverride: if non-null, the --release the user asked for on
//   the command line
var calculateContext = function (releaseOverride) {
  var context = {};

  var calculateReleaseVersion = function () {
    if (!files.usesWarehouse()) {
      if (releaseOverride) {
        logging.die(
          "Can't specify a release when running Meteor from a checkout.");
      }
      // The release in a git checkout is called "none" and is hardcoded in
      // warehouse.js to have no packages.
      return 'none';
    }

    // If a release was specified explicitly on the command line, that's the one
    // to use. Otherwise use the release specified in the app (if
    // any). Otherwise use the latest release.

    return releaseOverride ||
      context.appReleaseVersion ||
      warehouse.latestRelease();
  };

  var appDir = files.findAppDir();
  context.appDir = appDir && path.resolve(appDir);
  context.globalReleaseVersion = calculateReleaseVersion();

  if (context.appDir) {
    context.appReleaseVersion =
      project.getMeteorReleaseVersion(context.appDir) ||
      (files.usesWarehouse() ? warehouse.latestRelease() : 'none');
  }
  context.userReleaseOverride = !!releaseOverride;

  // Recalculate release version, taking the current app into account.
  setReleaseVersion(context, calculateReleaseVersion());
  toolsDebugMessage("Running Meteor Release " + context.releaseVersion);

  return context;
};

// Prints a message if $METEOR_TOOLS_DEBUG is set.
// XXX We really should have a better logging system.
// XXX XXX there is only one call anywhere to this (in toolsSpringboard)
var toolsDebugMessage = function (msg) {
  if (process.env.METEOR_TOOLS_DEBUG)
    console.log("[TOOLS DEBUG] " + msg);
};

// As the first step of running the Meteor CLI, check which Meteor
// release we should be running against. Then, check whether the
// tools corresponding to that release is the same as the one
// we're running. If not, springboard to the right tools (after
// having fetched it to the local warehouse)
var toolsSpringboard = function (context, extraArgs) {
  if (!context.releaseManifest ||
      context.releaseManifest.tools === files.getToolsVersion())
    return;

  toolsDebugMessage("springboarding from " + files.getToolsVersion() +
                    " to " + context.releaseManifest.tools);

  // Strip off the "node" and "meteor.js" from argv and replace it with the
  // appropriate tools's meteor shell script.
  var newArgv = process.argv.slice(2);
  newArgv.unshift(
    path.join(warehouse.getToolsDir(context.releaseManifest.tools),
              'bin', 'meteor'));
  if (extraArgs)
    newArgv.push.apply(newArgv, extraArgs);

  // Now shell quote this (because kexec wants to use /bin/sh -c) and execvp.
  // XXX fork kexec and make it take an array instead of using shell
  var quotedArgv = require('shell-quote').quote(newArgv);
  require('kexec')(quotedArgv);
};


///////////////////////////////////////////////////////////////////////////////
// Long-form help
///////////////////////////////////////////////////////////////////////////////

// Returns an array of entries with keys:
// - name (entry name, typically a command name)
// - body (contents of body, trimmed to end with a newline but no blank lines)
var loadHelp = function () {
  var ret = [];
  var raw = fs.readFileSync(path.join(__dirname, 'help.txt'), 'utf8');
  return _.map(raw.split(/^>>>/m).slice(1), function (r) {
    var lines = r.split('\n');
    var name = lines.shift().trim();
    return {
      name: name,
      body: lines.join('\n').replace(/\s*$/, '') + '\n'
    };
  });
};

var longHelp = function (commandName) {
  commandName = commandName.trim();
  var parts = commandName.length ? commandName.split(' ') : [];
  var node = commands;
  _.each(parts, function (part) {
    if (! _.has(node, part))
      throw new Error("walked off edge of command tree?");
    node = node[part];
  });

  var help = loadHelp();
  var commandList = null;
  if (! (node instanceof Command)) {
    commandList = '';
    var items = [];
    var commandsWanted = {};
    _.each(node, function (n, shortName) {
      var fullName = commandName + (commandName.length > 0 ? " " : "") +
        shortName;
      // For now, we don't include commands with subcommands in the
      // list -- if you have a command 'admin grant' then 'admin' does
      // not appear in the top-level help. If we one day want to make
      // these kinds of commands visible to casual users, we'll need a
      // way to mark them as visible or hidden.
      if (n instanceof Command && ! n.hidden)
        commandsWanted[fullName] = { name: shortName };
    });
    var maxNameLength = _.max(_.map(commandsWanted, function (c) {
      return c.name.length;
    }));

    // Assemble help text for subcommands.. in the order they appear
    // in the help file
    _.each(help, function (helpEntry) {
      if (_.has(commandsWanted, helpEntry.name)) {
        var shortName = commandsWanted[helpEntry.name].name;
        commandList += "   " + shortName +
          new Array(maxNameLength + 1).join(' ').substr(shortName.length) +
          "   " + helpEntry.body.split('\n')[0] + "\n";
      }
    });

    // Remove trailing newline so that you can write "{{commands}}" on
    // a line by itself and it does what you think it would
    commandList = commandList.substr(0, commandList.length - 1);
  }

  var entry = _.find(help, function (c) {
    return c.name === commandName;
  });
  if (! entry)
    throw new Error("help missing for " + commandName + "?");
  var ret = entry.body.split('\n').slice(1).join('\n');
  if (commandList !== null)
    ret = ret.replace('{{commands}}', commandList);

  return ret;
};


///////////////////////////////////////////////////////////////////////////////
// XXX XXX XXX stuff that should go away
///////////////////////////////////////////////////////////////////////////////

// XXX refactor/remove
//
// If we're not in an app directory, die with an error message.
//
// @param cmd {String} The command that was run. Used when printing
//   error message.
main.requireDirInApp = function (context, cmd) {
  if (context.appDir) {
    // XXX this is an inelegant place to put these checks, but it is pretty
    // accurate for now: "all the commands that need an app and don't do
    // something special with releases" (ie, everything but create, update,
    // help, logs, mongo SITE, test-packages, and deploy -D).
    if (!files.usesWarehouse() && context.appReleaseVersion !== 'none') {
      console.log(
        "=> Running Meteor from a checkout -- overrides project version (%s)",
        context.appReleaseVersion);
      console.log();
    }
    if (files.usesWarehouse() && context.releaseVersion === 'none') {
      logging.die(
        "You must specify a Meteor version with --release when you work with this\n" +
          "project. It was created from an unreleased Meteor checkout and doesn't\n" +
          "have a version associated with it.\n" +
          "\n" +
          "You can permanently set a release for this project with 'meteor update'.");
    }
    return;
  }
  // This is where you end up if you type 'meteor' with no args. Be gentle to
  // the noobs..
  logging.die(cmd + ": You're not in a Meteor project directory.\n" +
        "\n" +
        "To create a new Meteor project:\n" +
        "   meteor create <project name>\n" +
        "For example:\n" +
        "   meteor create myapp\n" +
        "\n" +
        "For more help, see 'meteor --help'.");
};


// XXX refactor/remove
// called by the update command - we need to find another way to do this
main.hackContextForUpdateMaybeSpringboard = function (context) {
  // we need to update the releaseManifest in the context because that's
  // what toolsSpringboard reads
  setReleaseVersion(context, warehouse.latestRelease());

  // If the tools for this release is different, then toolsSpringboard
  // execs and does not return. Otherwise, keeps going.
  toolsSpringboard(context, ['--release=' + context.releaseVersion]);
};

///////////////////////////////////////////////////////////////////////////////
// Main entry point
///////////////////////////////////////////////////////////////////////////////

// This is the main function that runs when you type 'meteor'.

Fiber(function () {
  // If running inside the Emacs shell, set stdin to be blocking,
  // reversing node's normal setting of O_NONBLOCK on the evaluation
  // of process.stdin (because Node unblocks stdio when forking). This
  // fixes execution of Mongo from within Emacs shell.
  if (process.env.EMACS == "t") {
    process.stdin;
    var child_process = require('child_process');
    child_process.spawn('true', [], {stdio: 'inherit'});
  }

  // Check required Node version.
  // This code is duplicated in tools/server/boot.js.
  var MIN_NODE_VERSION = 'v0.10.22';
  if (require('semver').lt(process.version, MIN_NODE_VERSION)) {
    process.stderr.write(
      'Meteor requires Node ' + MIN_NODE_VERSION + ' or later.\n');
    process.exit(1);
  }

  var commandName = '';
  var command = null;
  var isRawCommand = false;
  var showHelp = false;

  // Check to see if it is a "raw" command that handles its own
  // argument parsing.
  if (process.argv.length > 2 &&
      _.has(commands, process.argv[2]) &&
      commands[process.argv[2]].raw) {
    command = commands[process.argv[2]];
    commandName = command.name;
    isRawCommand = true;
  }

  // Parse the arguments.
  //
  // We must first identify which options are boolean and which take
  // arguments (which must be consistent across all defined
  // commands). This is necessary to resolve cases like 'meteor --flag
  // stuff thing'. Is the command 'stuff' with a boolean option
  // 'flag', or in the command 'thing' with an option 'flag' that is
  // set to 'stuff'? To resolve this we require that 'flag' be
  // consistently declared as a boolean (or not a boolean) across all
  // commands. We could just require the user to put the command
  // before any flag, but this being Meteor, we go to lengths to be
  // both correct and accommodating.
  //
  // (We used to do this in two passes, where the first pass just
  // pulled out the command and the release, and the second pass
  // parsed the arguments with knowledge of the command, but now that
  // we're determining upfront which options are boolean there's no
  // real benefit to two passes.)
  var opt = require('optimist')(process.argv.slice(2));
  opt.alias("h", "help")
    .boolean("h")
    .boolean("help");

  var isBoolean = { help: true, h: true };
  var walkCommands = function (node) {
    _.each(node, function (value, key) {
      if (value instanceof Command) {
        _.each(value.options || {}, function (optionInfo, optionName) {
          var names = [optionName];
          if (_.has(optionInfo, 'short'))
            names.push(optionInfo.short);
          _.each(names, function (name) {
            var optionIsBoolean = (optionInfo.type === Boolean);
            if (_.has(isBoolean, name)) {
              if (isBoolean[name] !== optionIsBoolean)  {
                throw new Error("conflict: option '" + name + "' is used " +
                                "both as a boolean and as another type");
              }
            } else {
              isBoolean[name] = optionIsBoolean;
              if (optionIsBoolean)
                // tell optimist that it doesn't take an argument
                opt.boolean(name);
              else
                // turn off optimist's heuristic parsing. we'll
                // manually parse it into the correct type later
                opt.string(name);

              // side note: it's a little unfortunate that optimist
              // puts all options in the same namespace and can't
              // distinguish between '-a foo' and '--a foo'. one day
              // we should probably just write our own argument
              // parsing logic as we're not really using very much of
              // optimist at this point.
            }
          });
        });
      } else {
        walkCommands(value);
      }
    });
  };
  walkCommands(commands);

  // This is for things like '--arch' and '--version' which look like
  // options, but actually function pretty much like commands. That's
  // a little weird but it feels right and it follows a grand Unix
  // tradition.
  _.each(commands['--'] || {}, function (value, key) {
    if (_.has(isBoolean, key))
      throw new Error("--" + key + " is both an option and a command?")
    opt.boolean(key);
  });

  // The following line actually parses the arguments (argv is a
  // getter -- note that mutating opt.argv directly would not work).
  var parsed = isRawCommand ? { _: [] } : opt.argv;
  _.each(_.keys(parsed), function (key) {
    // optimists gives us a value for every option we told it about,
    // even if it didn't appear on the command line. Delete the
    // options that didn't actually appear, which will have the value
    // 'false'.
    if (parsed[key] === false)
      delete parsed[key];
  });
  delete parsed['$0'];

  // Now before we do anything else, figure out the release to use,
  // and if that release goes with a different version of the tools,
  // quit and run those tools instead.
  //
  // Note that doing this correctly requires knowledge of which
  // arguments are boolean (in 'meteor --option --release 1.0', is
  // '--release' a flag or the values of '--option')? We have to use
  // the flag definitions in the current (latest) version of meteor to
  // decide whether to exec the other version of meteor that would
  // interpret the flags. That's not ideal, but it should do fine in
  // practice, and it's better than assuming that all options are or
  // aren't boolean when interpreting --release.

  var releaseOverride = null;
  if (_.has(parsed, 'release')) {
    // coerce to string (optimist has "do what I mean" parsing)
    releaseOverride = '' + parsed.release;
    delete parsed.release;
  }

  var context = calculateContext(releaseOverride);

  // If we're not running the correct tools, fetch it and
  // re-run. Do *not* do this if we are in a checkout, or if
  // process.env.METEOR_TEST_NO_SPRINGBOARD is set. This hook allows
  // unit tests to test the current tools's ability to run other
  // releases. Also, don't do this if we are in the middle of an
  // update that springboarded.
  if (!files.in_checkout() && !process.env.METEOR_TEST_NO_SPRINGBOARD)
    toolsSpringboard(context);

  // Check for the '--help' option.
  if (_.has(parsed, 'help')) {
    showHelp = true;
    delete parsed.help;
  }

  // Check for a command like '--arch' or '--version'. Make sure
  // there's only one. (And this is ignored if you've passed --help.)
  if (! command) {
    _.each(commands['--'] || {}, function (value, key) {
      if (parsed[key] && ! showHelp) {
        if (command) {
          process.stderr.write("Can't pass both " + command.name + " and " +
                               value.name + ".\n");
          process.exit(1);
        }
        command = value;
        commandName = command.name;
        delete parsed[key];
      }
    });
  }

  // OK, if not one of those, the first (non-'--') argument(s) should
  // name the command.
  var walk = commands;
  if (! command) {
    if (parsed._.length === 0) {
      // No arguments means 'run'.
      command = commands.run;
      commandName = "run";
      if (! command)
        throw new Error("no 'run' command?");
    } else {
      // Find the command they specified.
      for (var i = 0; i < parsed._.length; i++) {
        var word = parsed._[i];

        if (word === "help" && i === 0) {
          // "meteor help some command" (note that we can't support
          // "meteor some command help", since "meteor deploy help"
          // needs to actually deploy a site called 'help')
          showHelp = true;
          continue;
        }

        commandName += (commandName.length > 0 ? " " : "") + word;

        if (! _.has(walk, word)) {
          process.stderr.write(
"'" + commandName + "' is not a Meteor command. See 'meteor --help'.\n");
          process.exit(1);
        }

        if (walk[word] instanceof Command) {
          command = walk[word];
          parsed._ = parsed._.slice(i + 1); // consume arguments used
          break;
        }

        walk = walk[word];
      }

      if (! command && ! showHelp) {
        // They typed something like 'meteor admin' (when they were
        // supposed to type 'meteor admin grant' or something).
        process.stderr.write(
"Try 'meteor " + commandName + " help' for available commands.\n");
        process.exit(1);
      }
    }
  }

  // At this point we have a command[*]. Did they ask for help, or do
  // they actually want to run the command?
  //
  // [*] the one exception being 'meteor --help' or 'meteor help', in
  // which case showHelp will be true and command will be null

  if (showHelp) {
    process.stdout.write(longHelp(commandName) + "\n");
    process.exit(0);
  }

  // They want to run the command. Interpret the options and make sure
  // that they're valid.

  var options = { context: context };
  options.args = parsed._;
  delete parsed._;

  _.each(command.options, function (optionInfo, optionName) {
    var presentLong = _.has(parsed, optionName);
    var presentShort = _.has(optionInfo, 'short') &&
      _.has(parsed, optionInfo.short);

    if (presentShort && presentLong) {
      // this would get caught below, but give a clearer error message
      process.stderr.write(
commandName + ": can't pass both -" + optionInfo.short + " and --" +
            optionName + ".\n" +
"Try 'meteor help " + commandName + "' for help.\n");
      process.exit(1);
    }
    var actualOptionName = presentShort ? "-" + optionInfo.short :
      "--" + optionName;

    // If you pass an option twice, optimist gives us an
    // array. OK. Concatenate all of the values we've got into one big
    // array.
    var toArray = function (v) {
      return _.isArray(v) ? v : [v];
    };
    var values = [];
    if (presentLong)
      values = values.concat(toArray(parsed[optionName]));
    if (presentShort)
      values = values.concat(toArray(parsed[optionInfo.short]));

    if (values.length > 1) {
      // in the future, we could support multiple values, but we don't
      // for now since no command needs it
      process.stderr.write(
commandName + ": can only take one " + actualOptionName + " option.\n" +
"Try 'meteor help " + commandName + "' for help.\n");
      process.exit(1);
    } else if (values.length === 1) {
      // OK, they provided exactly one value. Check its type and add
      // to the output.
      var value = values[0];
      if (optionInfo.type === Number) {
        if (! value.match(/^[1-9][0-9]*$/)) {
          process.stderr.write(
"--" + optionName + " " +
  (presentShort ? "(-" + optionInfo.short + ") " : "") +
  "must be a number.\n" +
"Try 'meteor help " + commandName + "' for help.\n");
          process.exit(1);
        }
        value = parseInt(value);
      } else if (optionInfo.type === Boolean) {
        value = true;
      } else if (optionInfo.type === String) {
        // make sure optimist gave us the raw string, as we asked it
        // to (not sure if there's ever a case it'll do otherwise --
        // '-x123' perhaps?)
        value = '' + value;
      } else {
        throw new Error("unknown option type?");
      }
      options[optionName] = value;

      // Remove from the list of input arguments so that later we can
      // detect unrecognized arguments.
      if (presentLong)
        delete parsed[optionName];
      if (presentShort)
        delete parsed[optionInfo.short];
    } else {
      // Option not supplied. Throw an error if it was required,
      // supply a default value if one is defined, or just leave it
      // out.
      if (_.has(optionInfo, 'default')) {
        options[optionName] = optionInfo.default;
      } else if (optionInfo.required) {
        process.stderr.write(
commandName + ": the --" + optionName + " option is required.\n" +
longHelp(commandName) + "\n");
        process.exit(1);
      }
    }
  });

  // Check for unrecognized options.
  if (_.keys(parsed).length > 0) {
    var k = _.keys(parsed)[0];
    // optimist doesn't tell us whether it was -f or --f. guess
    var originalName = (k.length > 1 ? "--" : "-") + k;

    process.stderr.write(
originalName + ": unrecognized option.\n" +
longHelp(commandName) + "\n");
    process.exit(1);
  }

  // Check argument count.
  if (options.args.length < command.minArgs) {
    process.stderr.write(
commandName + ": not enough arguments.\n" +
longHelp(commandName) + "\n");
    process.exit(1);
  }

  if (options.args.length > command.maxArgs) {
    process.stderr.write(
commandName + ": too many arguments.\n" +
longHelp(commandName) + "\n");
    process.exit(1);
  }

  // Now that we're ready to start executing the command, if we are in
  // startup time profiling mode, print the profile.
  if (showRequireProfile)
    require('./profile-require.js').printReport();

  // Run the command!
  try {
    var ret = command.func(options);
  } catch (e) {
    if (e === main.ShowUsage)
      throw new Error(
        "you meant 'throw new main.ShowUsage', not 'throw main.ShowUsage'");
    if (e instanceof main.ShowUsage) {
      process.stderr.write(longHelp(commandName) + "\n");
      return 1;
    }
    throw e;
  }
  if (ret === undefined)
    ret = 0;
  if (typeof ret !== "number")
    throw new Error("command returned non-number?");
  process.exit(ret);
}).run();
