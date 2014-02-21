var showRequireProfile = ('METEOR_PROFILE_REQUIRE' in process.env);
if (showRequireProfile)
  require('./profile-require.js').start();

var _ = require('underscore');
var Fiber = require('fibers');
var files = require('./files.js');
var path = require('path');
var warehouse = require('./warehouse.js');
var release = require('./release.js');
var project = require('./project.js');
var fs = require('fs');

var main = exports;

// node (v8) defaults to only recording 10 lines of stack trace. This
// in especially insufficient when using fibers, because you get
// proper call stacks instead of only seeing the stack up to the most
// recent callback invocation. Increase the limit (for the `meteor` tool
// itself, not for apps).
//
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
Error.stackTraceLimit = Infinity;

///////////////////////////////////////////////////////////////////////////////
// Command registration
///////////////////////////////////////////////////////////////////////////////

var Command = function (options) {
  options = _.extend({
    minArgs: 0,
    options: {},
    requiresApp: false,
    requiresRelease: true,
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
    if (key === "args" || key === "appDir")
      throw new Error(options.name + ": bad option name " + key);
    if (! _.has(value, 'type'))
      value.type = String;
    if (_.has(value, 'default') && _.has(value, 'required'))
      throw new Error(options.name + ": " + key + " can't be both optional " +
                      "and required");
    if (_.has(value, 'short') && value.short.length !== 1)
      throw new Error(options.name + ": " + key + " has a bad short option");
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
main.WaitForExit = function () {};

// Exception to throw from a command to exit, restart, and reinvoke
// the command with the latest available (downloaded) Meteor release.
main.SpringboardToLatestRelease = function () {};

// Register a command-line command.
//
// options:
// - name
//   - can be a basic command, like "deploy"
//   - can be a subcommand, like "admin grant"
//     (distinguished by presence of ' ')
//   - can be an option that functions as a command, ilke "--arch"
//     (distinguished by starting with '--')
// - minArgs: minimum non-option arguments that can be present (default 0)
// - maxArgs: maximum non-option arguments that can be present (defaults to
//   whatever value you passed for minArgs; use Infinity for unlimited)
// - options: map from long option name to:
//   - type: String, Number, or Boolean. default is String. a future
//     version could support [String] and [Number] to allow the option to
//     be passed more than once, but we don't do that yet.
//   - short: single character short alias (eg, 'p' for 'port', to do -p 3000)
//   - default: value to use if none supplied
//   - required: true if required (incompatible with 'default')
// - requiresApp: does this command work with an app? possible values
//   (defaults to false):
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
//     these, set requiresApp to a function that takes 'options' (same as
//     would be received by the actual command function) and returns
//     true or false.
// - requiresRelease: defaults to true. Set to false if this command
//   doesn't need a functioning Meteor release to be available (that
//   is, if the command does not need the ability to resolve
//   packages). There is only one case where this comes up: if you
//   create an app with a checkout (so that it has no release), and
//   then run that app with released Meteor. Normally this just prints
//   an error saying that you have to pick a release, but you can
//   disable that by setting this flag to false. Even if you set this
//   flag, we will still *attempt* to run the correct Meteor release
//   just like we always do; it's just that in that one case, instead
//   of bailing out with an error we will run your command with
//   release.current === null.
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
// - On success, return undefined (or 0). This indicates successful
//   completion, and the program will exit with status 0.
// - On failure, return a positive number. The program will exit with that
//   status.
// - If the command-line arguments aren't valid, 'throw new
//   main.ShowUsage'. This will print usage info for the command and
//   exit with status 1.
// - If you have started (for example) a subprocess or worker fiber
//   and want to wait until it's finished to exit, 'throw new
//   main.WaitForExit'. This will skip the call to process.exit and the
//   program will keep running until node thinks that everything is
//   done.
// - To quit, restart, and rerun the command with a latest available
//   (downloaded) Meteor release, 'throw new main.SpringboardToLatestRelease'.
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
  var cmd = path.join(warehouse.getToolsDir(toolsVersion), 'bin', 'meteor');

  if (releaseOverride !== undefined)
    // We used to just append --release=<releaseOverride> to the arguments, and
    // though that's probably safe in practice, it makes us worry about things
    // like other --release options.  So now we use an environment
    // variable. #SpringboardEnvironmentVar
    process.env['METEOR_SPRINGBOARD_RELEASE'] = releaseOverride;

  // Now exec; we're not coming back.
  require('kexec')(cmd, newArgv);
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
  var MIN_NODE_VERSION = 'v0.10.25';
  if (require('semver').lt(process.version, MIN_NODE_VERSION)) {
    process.stderr.write(
      'Meteor requires Node ' + MIN_NODE_VERSION + ' or later.\n');
    process.exit(1);
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
  // commands.
  //
  // XXX The problem with the above is that which commands are boolean
  // may change across releases, and when we springboard, we actually
  // have to parse the options with the *target* version's
  // semantics. All in all, I think we might be better served to
  // require options to come after the command, other than special
  // options (--release, --help, and options that act as
  // commands). Then we don't have to require consistency of boolean
  // status between commands; we instead have to require consistency
  // of boolean status of a particular option, for a command, across
  // releases. Since we always start out by running the latest version
  // of Meteor, which can have knowledge of all past versions
  // (including the boolean status of formerly present but removed
  // options, including options to removed commands), this should let
  // us be 100% correct. (Of course, we could still do this if we
  // required options to be consistent across commands as well, but I
  // think this is a better tradeoff.) In this model, we'd do option
  // parsing in two passes, where the first pass just pulls out the
  // command, and the second parses the arguments with knowledge of
  // the command. I would make this change right now but we're on a
  // tight timetable for 1.0 and there is no advantage to doing it now
  // rather than later. #ImprovingCrossVersionOptionParsing

  var isBoolean = { "--help": true };
  var walkCommands = function (node) {
    _.each(node, function (value, key) {
      if (value instanceof Command) {
        _.each(value.options || {}, function (optionInfo, optionName) {
          var names = ["--" + optionName];
          if (_.has(optionInfo, 'short'))
            names.push("-" + optionInfo.short);
          _.each(names, function (name) {
            var optionIsBoolean = (optionInfo.type === Boolean);
            if (_.has(isBoolean, name)) {
              if (isBoolean[name] !== optionIsBoolean)  {
                throw new Error("conflict: option '" + name + "' is used " +
                                "both as a boolean and as another type");
              }
            } else {
              isBoolean[name] = optionIsBoolean;
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
  // a little weird but it feels good and it follows a grand Unix
  // tradition.
  _.each(commands['--'] || {}, function (value, key) {
    if (_.has(isBoolean, "--" + key))
      throw new Error("--" + key + " is both an option and a command?");
    isBoolean["--" + key] = true;
  });

  // Now parse!
  var argv = process.argv.slice(2);
  var rawOptions = {}; // map from '--foo' or '-f' to array of values
  var rawArgs = [];
  for (var i = 0; i < argv.length; i++) {
    var term = argv[i];

    // --: stop-parsing marker
    if (term === "--") {
      // Remainder is unparsed
      rawArgs = rawArgs.concat(argv.slice(i + 1));
      break;
    }

    // -: just an argument named '-'
    if (term === "-") {
      rawArgs.push(term);
      continue;
    }

    if (term.match(/^--?=/)) {
      process.stderr.write("Option names cannot begin with '='.\n");
      process.exit(1);
    }

    // A single option, like --foo or -f
    if (term.match(/^--/) || term.match(/^-.$/)) {
      var value = undefined;

      // Split the term (once only!) on an equal sign.
      var equals = term.indexOf('=');
      if (equals !== -1) {
        value = term.substr(equals + 1);
        term = term.substr(0, equals);
      }

      if (! _.has(rawOptions, term))
        rawOptions[term] = [];

      // Save off the value of the option. true for (known) booleans,
      // null if value is missing, else a string. Don't try to
      // validate or interpret it yet.
      if (isBoolean[term]) {
        // If we got an '=' for a boolean, this is an error, which will be
        // printed prettily later if we push false here.
        rawOptions[term].push(value === undefined);
      } else if (value !== undefined) {
        // Handle '--foo=bar' and '--foo=' (which means "set to empty string").
        rawOptions[term].push(value);
      } else if (i === argv.length - 1) {
        rawOptions[term].push(null);
      } else {
        rawOptions[term].push(argv[i + 1]);
        i ++;
      }
      continue;
    }

    // Compound short option ('-abc', '-p45', '-abcp45')? Rewrite it
    // in place into '-a -b -c', '-p 45', '-a -b -c -p 45'. Not that
    // anyone really talks this way anymore.
    if (term.match(/^-/)) {
      if (term.match(/^-[-=]?$/))
        throw Error("these cases should be handled above?");

      var replacements = [];
      for (var j = 1; j < term.length; j++) {
        var subterm = "-" + term.charAt(j);
        if (isBoolean[subterm] === false) {
          // If we recognize this short option, and we're sure that it
          // takes a value, and there are remaining characters in the
          // short option, then those remaining characters are the value.
          replacements.push(subterm);
          var remainder = term.substr(j + 1);
          if (remainder.length) {
            // If there's an '=' here, don't include it in the option value. A
            // trailing '=' *should* cause us to set the option value to ''.
            if (remainder.charAt(0) === '=')
              remainder = remainder.substr(1);
            replacements.push(remainder);
            break;
          }
        } else if (isBoolean[subterm] &&
                   j + 1 < term.length && term.charAt(j + 1) === '=') {
          // We know it's a boolean, but we've been given an '='. This will
          // cause a pretty error later.
          if (! _.has(rawOptions, subterm))
            rawOptions[subterm] = [];
          rawOptions[subterm].push(false);
          // Don't process the '=' on the next pass.
          j ++;
        } else {
          // It's a boolean without an '=', or it's something we've never heard
          // of.  (In the latter case, assume it's boolean for now, and we'll
          // print an error later.)
          replacements.push(subterm);
        }
      }

      _.partial(argv.splice, i, 1).apply(argv, replacements);
      i --;
      continue;
    }

    // It is a plain old argument!
    rawArgs.push(term);
  }

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
  // aren't boolean when interpreting --release. See
  // #ImprovingCrossVersionOptionParsing.

  var releaseOverride = null;
  if (_.has(rawOptions, '--release')) {
    if (rawOptions['--release'].length > 1) {
      process.stderr.write(
"--release should only be passed once.\n" +
"Try 'meteor help' for help.\n");
      process.exit(1);
    }
    releaseOverride = rawOptions['--release'][0];
    if (! releaseOverride) {
      process.stderr.write(
"The --release option needs a value.\n" +
"Try 'meteor help' for help.\n");
      process.exit(1);
    }
    delete rawOptions['--release'];
  }
  if (_.has(process.env, 'METEOR_SPRINGBOARD_RELEASE')) {
    // See #SpringboardEnvironmentVar
    releaseOverride = process.env['METEOR_SPRINGBOARD_RELEASE'];
  }

  var releaseName, appRelease;
  if (appDir) {
    // appRelease will be null if a super old project with no
    // .meteor/release or 'none' if created by a checkout
    appRelease = project.getMeteorReleaseVersion(appDir);
    // This is what happens if the file exists and is empty. This really
    // shouldn't happen unless the user did it manually.
    if (appRelease === '') {
      process.stderr.write(
"Problem! This project has a .meteor/release file which is empty.\n" +
"The file should either contain the release of Meteor that you want to use,\n" +
"or the word 'none' if you will only use the project with unreleased\n" +
"checkouts of Meteor. Please edit the .meteor/release file in the project\n" +
"and change it to a valid Meteor release or 'none'.\n");
      process.exit(1);
    }
  }

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
    try {
      var rel = release.load(releaseName, {
        packageDirs: packageDirs
      });
    } catch (e) {
      var name = releaseName;
      if (e instanceof files.OfflineError) {
        if (appDir) {
          process.stderr.write(
"Sorry, this project uses Meteor " + name + ", which is not installed and\n"+
"could not be downloaded. Please check to make sure that you are online.\n");
        } else {
          process.stderr.write(
"Sorry, Meteor " + name + " is not installed and could not be downloaded.\n"+
"Please check to make sure that you are online.\n");
        }
        process.exit(1);
      }

      if (e instanceof warehouse.NoSuchReleaseError) {
        if (releaseOverride) {
          process.stderr.write(name + ": unknown release.\n");
        } else if (appDir) {
          process.stderr.write(
"Problem! This project says that it uses version " + name + " of Meteor,\n" +
"but you don't have that version of Meteor installed and the Meteor update\n" +
"servers don't have it either. Please edit the .meteor/release file in the\n" +
"project and change it to a valid Meteor release.\n");
        } else {
          throw new Error("can't load latest release?");
        }
        process.exit(1);
      }

      throw e;
    }

    release.setCurrent(rel, /* forced */ !! releaseOverride);
  }

  // If we're not running the correct version of the tools for this
  // release, fetch it and re-run.
  //
  // This will never happen when we're springboarding as part of an
  // update, because the correct tools version will have been chosen
  // the first time around. It will also never happen if the current
  // release is a checkout, because that doesn't make any sense.
  if (release.current && release.current.isProperRelease() &&
      release.current.getToolsVersion() !== files.getToolsVersion()) {
    springboard(release.current.getToolsVersion()); // does not return!
  }

  // Check for the '--help' option.
  var showHelp = false;
  if (_.has(rawOptions, '--help')) {
    showHelp = true;
    delete rawOptions['--help'];
  }

  var commandName = '';
  var command = null;

  // Check for a command like '--arch' or '--version'. Make sure
  // it stands alone. (And this is ignored if you've passed --help.)
  if (! showHelp) {
    _.each(commands['--'] || {}, function (value, key) {
      var fullName = "--" + key;

      if (rawOptions[fullName]) {
        if (rawOptions[fullName].length > 1) {
          process.stderr.write("It doesn't make sense to pass " +
                               fullName + " more than once.\n");
          process.exit(1);
        }
        if (_.size(rawOptions) > 1 || rawArgs.length !== 0 || command) {
          process.stderr.write("Can't pass anything else along with " +
                               value.name + ".\n");
          process.exit(1);
        }
        command = value;
        commandName = command.name;
        delete rawOptions['--' + key];
      }
    });
  }

  // OK, if not one of those, the first (non-'--') argument(s) should
  // name the command.
  if (! command) {
    if (rawArgs.length === 0) {
      // No arguments means 'run'. Unless it's 'meteor --help'.
      if (! showHelp) {
        command = commands.run
        commandName = "run";
        if (! command)
          throw new Error("no 'run' command?");
      }
    } else {
      // Find the command they specified.
      var walk = commands;
      for (var i = 0; i < rawArgs.length; i++) {
        var word = rawArgs[i];

        // Support "meteor help", "meteor help deploy", "meteor help admin",
        // "meteor admin help", "meteor admin help grant", etc.  (But not
        // "meteor deploy help" or "meteor admin grant help": once we find an
        // actual command, we assume "help" is an argument, eg a site called
        // 'help'!)
        if (word === "help") {
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
          rawArgs = rawArgs.slice(i + 1); // consume arguments used
          break;
        }

        walk = walk[word];
      }
    }
  }

  if (! command && ! showHelp) {
    // They typed something like 'meteor admin' (when they were
    // supposed to type 'meteor admin grant' or something).
    process.stderr.write(
"Try 'meteor " + commandName + " help' for available commands.\n");
    process.exit(1);
  }

  // At this point we have a command[*]. Did they ask for help, or do
  // they actually want to run the command? If the former, print the
  // help and don't criticize anything else they may have given us.
  //
  // [*] the one exception being 'meteor --help' or 'meteor help', in
  // which case showHelp will be true and command will be null

  if (showHelp) {
    process.stdout.write(longHelp(commandName) + "\n");
    process.exit(0);
  }

  // They want to run the command. Interpret the options and make sure
  // that they're valid.

  var options = { args: rawArgs };

  _.each(command.options, function (optionInfo, optionName) {
    var presentLong = _.has(rawOptions, "--" + optionName);
    var presentShort = _.has(optionInfo, 'short') &&
      _.has(rawOptions, "-" + optionInfo.short);

    if (presentShort && presentLong) {
      // this would get caught below, but give a clearer error message
      process.stderr.write(
commandName + ": can't pass both -" + optionInfo.short + " and --" +
            optionName + ".\n" +
"Try 'meteor help " + commandName + "' for help.\n");
      process.exit(1);
    }
    var helpfulOptionName = "--" + optionName +
      (presentShort ? " (-" + optionInfo.short + ")" : "");

    // Collect all values we've received for this option, across the
    // long and short versions, and across possibly multiple
    // occurrences of the option on the command line
    var values = [];
    if (presentLong)
      values = values.concat(rawOptions["--" + optionName]);
    if (presentShort)
      values = values.concat(rawOptions["-" + optionInfo.short]);

    if (values.length > 1) {
      // in the future, we could support multiple values, but we don't
      // for now since no command needs it
      process.stderr.write(
commandName + ": can only take one " + helpfulOptionName + " option.\n" +
"Try 'meteor help " + commandName + "' for help.\n");
      process.exit(1);
    } else if (values.length === 1) {
      // OK, they provided exactly one value. Check its type and add
      // to the output.
      var value = values[0];
      if (value === null) {
        // This option requires a value and they didn't give it one
        // (it was the last word on the command line, or it was
        // a short option immediately followed by a non-number).
        process.stderr.write(
commandName + ": the " + helpfulOptionName + " option needs a value.\n" +
"Try 'meteor help " + commandName + "' for help.\n");
        process.exit(1);
      } else if (optionInfo.type === Number) {
        if (! value.match(/^[0-9]+$/)) {
          process.stderr.write(
commandName + ": " + helpfulOptionName + " must be a number.\n" +
"Try 'meteor help " + commandName + "' for help.\n");
          process.exit(1);
        }
        value = parseInt(value);
      } else if (optionInfo.type === Boolean) {
        if (!value) {
          process.stderr.write(
commandName + ": the " + helpfulOptionName + " option does not need a value.\n" +
"Try 'meteor help " + commandName + "' for help.\n");
          process.exit(1);
        }
        value = true;
      } else if (optionInfo.type === String) {
        // nothing to do, 'value' needs no parsing or validation
      } else {
        throw new Error("unknown option type?");
      }
      options[optionName] = value;

      // Remove from the list of input arguments so that later we can
      // detect unrecognized arguments.
      if (presentLong)
        delete rawOptions["--" + optionName];
      if (presentShort)
        delete rawOptions["-" + optionInfo.short];
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
  if (_.keys(rawOptions).length > 0) {
    process.stderr.write(
_.keys(rawOptions)[0] + ": unknown option.\n" +
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

  if (command.requiresRelease && ! release.current) {
    process.stderr.write(
"You must specify a Meteor version with --release when you work with this\n" +
"project. It was created from an unreleased Meteor checkout and doesn't\n" +
"have a version associated with it.\n" +
"\n" +
"You can permanently set a release for this project with 'meteor update'.\n");
    process.exit(1);
  }

  if (command.requiresApp && release.current.isCheckout() &&
      appRelease && appRelease !== "none") {
    // For commands that work with apps, if we have overridden the
    // app's usual release by using a checkout, print a reminder banner.
    process.stderr.write(
"=> Running Meteor from a checkout -- overrides project version (" +
        appRelease + ")\n");
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
        e === main.SpringboardToLatestRelease)
      throw new Error(
        "you meant 'throw new main.Foo', not 'throw main.Foo'");
    if (e instanceof main.ShowUsage) {
      process.stderr.write(longHelp(commandName) + "\n");
      process.exit(1);
    }
    if (e instanceof main.SpringboardToLatestRelease) {
      // Load the latest release's metadata so that we can figure out
      // the tools version that it uses.
      var latestRelease = release.load(release.latestDownloaded());
      springboard(latestRelease.getToolsVersion(), latestRelease.name);
      // (does not return)
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
