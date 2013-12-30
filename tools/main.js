var showRequireProfile = ('METEOR_PROFILE_REQUIRE' in process.env);
if (showRequireProfile)
  require('./profile-require.js').start();

var _ = require('underscore');
var Fiber = require('fibers');
var files = require('./files.js');
var path = require('path');
var warehouse = require('./warehouse.js');
var library = require('./library.js');
var release = require('./release.js');
var optimist = require('optimist');
var fs = require('fs');

var main = exports;

///////////////////////////////////////////////////////////////////////////////
// Command registration
///////////////////////////////////////////////////////////////////////////////

var Command = function (options) {
  options = _.extend({
    minArgs: 0,
    options: {},
    requiresApp: false,
    requiresRelease: true,
    raw: false,
    hidden: false
  }, options);

  if (! _.has(options, 'maxArgs'))
    options.maxArgs = options.minArgs;

  _.each(["name", "func"], function (key) {
    if (! _.has(options, key))
      throw new Error("command missing '" + key + "'?");
  });

  _.extend(this, options);

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

// Exception to throw to skip the process.exit call.
// usage information.
main.WaitForExit = function () {};

// Exception to throw from a command to exit, restart, and reinvoke
// the command with a different Meteor release.
main.SpringboardToRelease = function (releaseName) {
  if (! releaseName)
    throw new Error("didn't specify a release?");
  this.releaseName = releaseName;
};

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
// - requiresApp: does this command work with an app? possible values:
//   - true if an app is required, and command must be run inside an
//     app. The command will be run using the app's Meteor release
//     (unless overridden by --release or a checkout). An 'appDir'
//     option will be passed with the absolute path to the app's
//     top-level directory, and an error will be printed if the
//     command isn't run from inside an app.
//   - false if an app is not required. But if the command does happen
//     to have been run from an app, 'appDir' will be
//     provided. Moreover, in that case, we will still use the version
//     of this program that goes with the Meteor release of the
//     app. This is not ideal but is necessary for 'meteor help' to
//     behave in a sane way in our current system. (XXX In the future
//     we should separate the build system out into a package that is
//     versioned with the release, and then take the CLI tool out of
//     the release and always use the latest available version.)
//   - function: some apps determine whether they use an app based on
//     their arguments (eg, 'deploy' versus 'deploy --delete'). for
//     these, set usesApp to a function that takes 'options' (same as
//     would be received by the actual command function) and returns
//     true or false.
// - requiresRelease: defaults to true. Set to false if this command
//   doesn't need a functioning Meteor release to be available (that
//   is, if the command does not need the ability to resolve
//   packages). There is only one case where this comes up: if you
//   create an app with a checkout (so that it has no release), and
//   then run that app with released Meteor. Normally this just prints
//   an error saying that you have to pick a release, but you can
//   disable that by setting this flag to false.
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
// - appDir: if run from inside an app tree, the absolute path to the
//   app's top-level directory
//
// func should do one of the following:
// - On success, return undefined. This indicates successful
//   completion, and the program will exit with status 0.
// - On failure, return a number. The program will exit with that
//   status.
// - If the command-line arguments aren't valid, 'throw new
//   main.ShowUsage'. This will print usage info for the command and
//   exit with status 1.
// - If you have started (for example) a subprocess or worker fiber
//   and want to wait until it's finished to exit, throw
//   main.WaitForExit. This will skip the call to process.exit and the
//   program will keep running until node thinks that everything is
//   done.
// - To quit, restart, and rerun the command with a different Meteor
//   release, 'throw new mainSpringboardToRelease(releaseName)'.
//
// Commands should never call process.exit()! They should instead
// return an appropriate value. Not all commands obey that yet, but
// please write new commands in that style if possible.

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
// Springboarding
///////////////////////////////////////////////////////////////////////////////

// Exit and restart the program, with the same arguments, but using a
// different version of the tool and/or forcing a particular release.
//
// - toolsVersion: required. the version of the tool to run. must
//   already be downloaded.
// - releaseOverride: optional. if provided, a release name to force
//   us to use when restarting (this functions exactly like --release
//   and will cause release.forced to be true).
var springboard = function (toolsVersion, releaseOverride) {
  // Strip off the "node" and "meteor.js" from argv and replace it with the
  // appropriate tools's meteor shell script.
  var newArgv = process.argv.slice(2);
  newArgv.unshift(
    path.join(warehouse.getToolsDir(toolsVersion), 'bin', 'meteor'));

  if (releaseOverride !== undefined)
    // We used to just append --release=<releaseOverride> to the
    // arguments, and though that's probably safe in practice, there's
    // a lot to worry about: conflicts with other --release options,
    // or 'raw' commands that do their own argument parsing. So now we
    // use environment variable. #SpringboardEnvironmentVar
    process.env['METEOR_SPRINGBOARD_RELEASE'] = releaseOverride;

  // Now shell quote this (because kexec wants to use /bin/sh -c) and execvp.
  // XXX fork kexec and make it take an array instead of using shell
  var quotedArgv = require('shell-quote').quote(newArgv);
  require('kexec')(quotedArgv);
};

///////////////////////////////////////////////////////////////////////////////
// Main entry point
///////////////////////////////////////////////////////////////////////////////

// This is the main function that runs when you type 'meteor'.

// It's mostly concerned with validating command-line arguments,
// finding the requested command in the commands table, and making
// sure that you're using the version of the Meteor tools that match
// your project.

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

  // Figure out if we're running in a directory that is part of a
  // Meteor application. Determine any additional directories to
  // search for packages.

  var appDir = files.findAppDir();
  if (appDir)
    appDir = path.resolve(appDir);

  var packageDirs = [];
  if (appDir)
    packageDirs.push(path.join(appDir, 'packages'));

  if (process.env.PACKAGE_DIRS)
    // User can provide additional package directories to search in
    // PACKAGE_DIRS (colon-separated).
    packageDirs = packageDirs.concat(process.env.PACKAGE_DIRS.split(':'));

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
  if (_.has(process.env, 'METEOR_SPRINGBOARD_RELEASE')) {
    // See #SpringboardEnvironmentVar
    releaseOverride = process.env['METEOR_SPRINGBOARD_RELEASE'];
  }

  var releaseName, appRelease;
  if (! files.usesWarehouse()) {
    // Running from a checkout
    if (releaseOverride) {
      process.stderr.write(
        "Can't specify a release when running Meteor from a checkout.\n");
      process.exit(1);
    }
    releaseName = null;
  } else {
    // Running from an install
    if (releaseOverride) {
      // Use the release explicitly specified on the command line.
      releaseName = releaseOverride;
    } else if (appDir) {
      // Running from an app directory. Use release specified by app.
      //
      // appRelease will be null if a super old project with no
      // .meteor/release or 'none' if created by a checkout
      appRelease = project.getMeteorReleaseVersion(appDir);
      if (appRelease === 'none') {
        // Looks like we don't have a release. Leave release.current === null.
      } else {
        // Use the project's desired release, or if a super old
        // project, use the latest release we know about
        releaseName = appRelease || release.latestDownloaded();
      }
    } else {
      // Run outside an app dir with no --release flag. Use the latest
      // release we know about.
      releaseName = release.latestDownloaded();
    }
  }

  if (releaseName !== undefined) {
    release.setCurrent(release.load(releaseName, {
      packageDirs: packageDirs,
      forApp: !! appDir
    }), /* forced */ !! releaseOverride);
  }

  // If we're not running the correct version of the tools for this
  // release, fetch it and re-run. But suppress this if
  // process.env.METEOR_TEST_NO_SPRINGBOARD is set; this hook allows
  // unit tests to test the current tools's ability to run other
  // releases.
  //
  // This will never happen when we're springboarding as part of an
  // update, because the correct tools version will have been chosen
  // the first time around. It will also never happen if the current
  // release is a checkout, because that doesn't make any sense.
  if (release.current && release.current.isProperRelease() &&
      release.current.getToolsVersion() !== files.getToolsVersion() &&
      ! process.env.METEOR_TEST_NO_SPRINGBOARD) {
    springboard(release.current.getToolsVersion()); // does not return!
  }

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

  var options = { };
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

  // We know we have a valid command and options. Now check to see if
  // the command can only be run from an app dir, and add the appDir
  // option if running from an app.
  var requiresApp = command.requiresApp;
  if (typeof requiresApp === "function")
    requiresApp = requiresApp(options);

  if (appDir)
    options.appDir = appDir;

  if (requiresApp && ! options.appDir) {
    // This is where you end up if you type 'meteor' with no args,
    // since you'll default to the 'run' command which requires an
    // app. Be welcoming to our new developers!
    process.stderr.write(
commandName + ": You're not in a Meteor project directory.\n" +
"\n" +
"To create a new Meteor project:\n" +
"   meteor create <project name>\n" +
"For example:\n" +
"   meteor create myapp\n" +
"\n" +
"For more help, see 'meteor --help'.\n");
    process.exit(1);
  }

  if (options.requiresRelease && ! release.current) {
    process.stderr.write(
"You must specify a Meteor version with --release when you work with this\n" +
"project. It was created from an unreleased Meteor checkout and doesn't\n" +
"have a version associated with it.\n" +
"\n" +
"You can permanently set a release for this project with 'meteor update'.\n");
    process.exit(1);
  }

  if (options.requiresApp && release.current.isCheckout() &&
      appRelease !== "none") {
    // For commands that work with apps, if we have overridden the
    // app's usual release by using a checkout, print a reminder banner.
    console.log(
"=> Running Meteor from a checkout -- overrides project version (%s)\n",
      appRelease);
  }

  // Now that we're ready to start executing the command, if we are in
  // startup time profiling mode, print the profile.
  if (showRequireProfile)
    require('./profile-require.js').printReport();

  // Run the command!
  try {
    var ret = command.func(options);
  } catch (e) {
    if (e === main.ShowUsage || e === main.WaitForExit ||
        e === main.SpringboardToRelease)
      throw new Error(
        "you meant 'throw new main.Foo', not 'throw main.Foo'");
    if (e instanceof main.ShowUsage) {
      process.stderr.write(longHelp(commandName) + "\n");
      process.exit(1);
    }
    if (e instanceof main.SpringboardToRelease) {
      // First we need to load the other release's metadata so that we
      // can figure out the tools version that it uses. This could
      // load the release from the network (in which case it will
      // print progress messages and possibly even kill the program if
      // something goes wrong!) But it won't do that if you only
      // specify releases that are already downloaded in the
      // warehouse, which is what you'll most likely be doing.
      var otherRelease = release.load(e.releaseName);

      // Good to go! Now a function call that doesn't return:
      springboard(otherRelease.getToolsVersion(), otherRelease.name);
    }
    if (e instanceof main.WaitForExit)
      return;
    throw e;
  }

  // Exit. (We will not get here if the command threw an exception
  // such as main.WaitForExit).
  if (ret === undefined)
    ret = 0;
  if (typeof ret !== "number")
    throw new Error("command returned non-number?");
  process.exit(ret);
}).run();
