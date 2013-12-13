var PROFILE_REQUIRE = false;

if (PROFILE_REQUIRE)
  require('./profile-require.js').start();

var Fiber = require('fibers');
Fiber(function () {

  var path = require('path');
  var _ = require('underscore');
  var fs = require("fs");
  var cp = require('child_process');
  var files = require('./files.js');
  var deploy = require('./deploy.js');
  var runner = require('./run.js');
  var library = require('./library.js');
  var buildmessage = require('./buildmessage.js');
  var unipackage = require('./unipackage.js');
  var project = require('./project.js');
  var warehouse = require('./warehouse.js');
  var logging = require('./logging.js');
  var deployGalaxy;
  var cleanup = require('./cleanup.js');

  var Future = require('fibers/future');
  // This code is duplicated in tools/server/boot.js.
  var MIN_NODE_VERSION = 'v0.10.22';
  if (require('semver').lt(process.version, MIN_NODE_VERSION)) {
    process.stderr.write(
      'Meteor requires Node ' + MIN_NODE_VERSION + ' or later.\n');
    process.exit(1);
  }

  var killTunnel = function (tunnel) {
    if (! tunnel.exitFuture.isResolved()) {
      tunnel.proc.kill("SIGHUP");
      tunnel.exitFuture.wait();
    }
  };

  var sshTunnel = function (to, localPort, remoteEnd, keyfile) {
    var args = [];
    if (to.split(':')[1]){
      var hostPort = to.split(':');
      to = hostPort[0];
      args = ['-p', hostPort[1]].concat(args);
    }
    args = args.concat([to, '-L', localPort+':'+remoteEnd, 'echo __CONNECTED__ && cat -']);
    if (keyfile)
      args = ["-i", keyfile].concat(args);
    var tunnel = cp.spawn('ssh', args, {
      stdio: [process.stdin, 'pipe', 'pipe']
    });

    var exitFuture = new Future();
    var connectedFuture = new Future();

    tunnel.on('exit', function (code, signal) {
      if (!connectedFuture.isResolved()) {
        connectedFuture.throw(new Error("ssh exited without making a connection"));
      }
      exitFuture.return(signal || code);
    });

    tunnel.stdout.setEncoding('utf8');
    tunnel.stdout.on('data', function (str) {
      if (!connectedFuture.isResolved() && str.match(/__CONNECTED__/)) {
        connectedFuture.return(true);
      }
    });

    tunnel.stderr.setEncoding('utf8');
    tunnel.stderr.on('data', function (str) {
      if (str.match(/Killed by/))
        return;
      process.stderr.write(str);
    });

    var tunnelResult = {
      waitConnected: _.bind(connectedFuture.wait, connectedFuture),
      exitFuture: exitFuture,
      proc: tunnel
    };

    cleanup.onExit(function () {
      Fiber(function () {
        killTunnel(tunnelResult);
      }).run();
    });
    return tunnelResult;
  };

  var Commands = [];

  var usage = function() {
    process.stdout.write(
      "Usage: meteor [--version] [--arch] [--release <release>] [--help] <command> [<args>]\n" +
        "\n" +
        "With no arguments, 'meteor' runs the project in the current\n" +
        "directory in local development mode. You can run it from the root\n" +
        "directory of the project or from any subdirectory.\n" +
        "\n" +
        "Use 'meteor create <name>' to create a new Meteor project.\n" +
        "\n" +
        "Commands:\n");
    _.each(Commands, function (cmd) {
      if (cmd.help && ! cmd.hidden) {
        var name = cmd.name + "                ".substr(cmd.name.length);
        process.stdout.write("   " + name + cmd.help + "\n");
      }
    });
    process.stdout.write("\n");
    process.stdout.write(
      "See 'meteor help <command>' for details on a command.\n");
    process.exit(1);
  };

  // Stores the app directory (if any), release version, etc.
  var context = {};

  // Figures out if we're in an app dir, what release we're using, etc. May
  // download the release if necessary.
  var calculateContext = function (argv) {
    var appDir = files.findAppDir();
    context.appDir = appDir && path.resolve(appDir);
    context.globalReleaseVersion = calculateReleaseVersion(argv);

    if (context.appDir) {
      context.appReleaseVersion =
        project.getMeteorReleaseVersion(context.appDir) ||
        (files.usesWarehouse() ? warehouse.latestRelease() : 'none');
    }
    context.userReleaseOverride = !!argv.release;

    // Recalculate release version, taking the current app into account.
    setReleaseVersion(calculateReleaseVersion(argv));
    toolsDebugMessage("Running Meteor Release " + context.releaseVersion);
  };

  var calculateGalaxyContextAndTunnel = function (deployEndpoint,
                                                  context, sshIdentity) {
    var galaxyContext = {};
    var tunnel;
    // 9414 because 9414xy (gAlAxy) in 1337
    galaxyContext.port = process.env.PORT || 9414;
    if (deployEndpoint && deployEndpoint.indexOf("ssh://") === 0) {
      galaxyContext.url = "localhost:" + galaxyContext.port +
        "/ultraworld";
      galaxyContext.adminBaseUrl = "localhost:" +
        galaxyContext.port + "/";
      galaxyContext.host = deployEndpoint.substr("ssh://".length);
      galaxyContext.sshIdentity = sshIdentity;
      tunnel = sshTunnel(galaxyContext.host, galaxyContext.port,
                         "localhost:9414", galaxyContext.sshIdentity);
      tunnel.waitConnected();
      context.galaxy = galaxyContext;
    } else if (deployEndpoint) {
      galaxyContext.url = deployEndpoint + "/ultraworld";
      galaxyContext.adminBaseUrl = deployEndpoint + "/";
      context.galaxy = galaxyContext;
    }
    return tunnel;
  };

  var qualifySitename = function (site) {
    // Append .meteor.com if we don't have a domain name. In the future, we
    // probably want this to be configurable via a client-side preference of
    // some kind.
    if (site.indexOf(".") === -1)
      site = site + ".meteor.com";
    while (site[site.length - 1] === ".")
      site = site.substring(0, site.length - 1);
    return site;
  };

  var prepareForGalaxy = function (site, context, sshIdentity) {
    if (! deployGalaxy)
      deployGalaxy = require('./deploy-galaxy.js');
    var deployEndpoint = deployGalaxy.discoverGalaxy(site);
    return calculateGalaxyContextAndTunnel(deployEndpoint, context,
                                           sshIdentity);
  };

  // A command wrapped with galaxyCommand does the following:
  // 1. Looks for the first non-hyphenated argument, and assumes that that is the
  // site.
  // 2. Tries to discover and set up a connection to a galaxy. If the galaxy
  // discovery process indicates that a ssh tunnel needs to be set up, the optional
  // ssh-identity argument is used to set it up.
  // 3. Runs the command, and kills the tunnel, if any, when it finishes.
  var galaxyCommand = function (cmd) {
    return function (argv, showUsage) {
      if (argv._[0]) {
        argv._[0] = qualifySitename(argv._[0]);
        var tunnel = prepareForGalaxy(argv._[0], context, argv["ssh-identity"]);
        var result;
        try {
          result = cmd(argv, showUsage);
        } finally {
          if (tunnel)
            killTunnel(tunnel);
        }
        return result;
      } else {
        return cmd(argv, showUsage);
      }
    };
  };

  var setReleaseVersion = function (version) {
    context.releaseVersion = version;

    try {
      context.releaseManifest =
        warehouse.ensureReleaseExistsAndReturnManifest(context.releaseVersion);
    } catch (e) {
      if (!(e instanceof files.OfflineError))
        throw e;
      if (context.appDir && !context.userReleaseOverride) {
        logging.die(
          "Sorry, this project uses Meteor " + version + ", which is not installed and\n" +
          "could not be downloaded. Please check to make sure that you are online.");
      } else {
        logging.die(
          "Sorry, Meteor " + version + " is not installed and could not be downloaded.\n" +
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

  var calculateReleaseVersion = function (argv) {
    if (!files.usesWarehouse()) {
      if (argv.release) {
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

    return argv.release ||
      context.appReleaseVersion ||
      warehouse.latestRelease();
  };

  var maybePrintUserOverrideMessage = function () {
    if (files.usesWarehouse() &&
        context.appReleaseVersion !== 'none' &&
        context.appReleaseVersion !== context.releaseVersion) {
      console.log("=> Using Meteor %s as requested (overriding Meteor %s)",
                  context.releaseVersion, context.appReleaseVersion);
      console.log();
    }
  };

  // If we're not in an app directory, die with an error message.
  //
  // @param cmd {String} The command that was run. Used when printing
  //   error message.
  var requireDirInApp = function (cmd) {
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

  var find_mongo_port = function (cmd, callback) {
    requireDirInApp(cmd);
    var mongo_runner = require(path.join(__dirname, 'mongo_runner.js'));
    mongo_runner.find_mongo_port(context.appDir, callback);
  };

  var findCommand = function (name) {
    for (var i = 0; i < Commands.length; i++)
      if (Commands[i].name === name)
        return Commands[i];
    process.stdout.write("'" + name + "' is not a Meteor command. See " +
                         "'meteor --help'.\n");
    process.exit(1);
  };

  var runCommand = function (cmd, showHelp) {
    var cmdRunner = findCommand(cmd || 'run');
    // Reparse args.
    var opt = require('optimist')(process.argv.slice(2));
    cmdRunner.argumentParser(opt);
    var showUsage = function () {
      process.stdout.write(opt.help());
      process.exit(1);
    };
    if (showHelp) {
      showUsage();
    } else {
      // Remove the command name from argv._. Note that argv is a getter, so we
      // actually have to save it into a new variable if we want to mutate its
      // internals.
      var argv = opt.argv;
      if (cmd && cmd === argv._[0])
        argv._.shift();
      cmdRunner.func(argv, showUsage);
    }
  };

  // XXX when the pass unexpected argument or unrecognized flags, print
  // an error and fail out

  Commands.push({
    name: "run",
    help: "[default] Run this project in local development mode",
    argumentParser: function (opt) {
      // reparse args
      opt.alias('port', 'p').default('port', 3000)
        .describe('port', 'Port to listen on. NOTE: Also uses port N+1 and N+2.')
        .boolean('production')
        .describe('production', 'Run in production mode. Minify and bundle CSS and JS files.')
        .boolean('raw-logs')
        .describe('raw-logs', 'Run without parsing logs from stdout and stderr.')
        .describe('settings',  'Set optional data for Meteor.settings on the server')
        .describe('release', 'Specify the release of Meteor to use')
        .describe('program', 'The program in the app to run (Advanced)')
      // #Once
      // With --once, meteor does not re-run the project if it crashes and does
      // not monitor for file changes. Intentionally undocumented: intended for
      // automated testing (eg, cli-test.sh), not end-user use.
        .boolean('once')
        .usage(
          "Usage: meteor run [options]\n" +
            "\n" +
            "Searches upward from the current directory for the root directory of a\n" +
            "Meteor project, then runs that project in local development\n" +
            "mode. You can use the application by pointing your web browser at\n" +
            "localhost:3000. No internet connection is required.\n" +
            "\n" +
            "Whenever you change any of the application's source files, the changes\n" +
            "are automatically detected and applied to the running application.\n" +
            "\n" +
            "The application's database persists between runs. It's stored under\n" +
            "the .meteor directory in the root of the project.\n");
    },
    func: function (argv) {
      requireDirInApp("run");
      maybePrintUserOverrideMessage();
      runner.run(context, {
        port: argv.port,
        rawLogs: argv['raw-logs'],
        minify: argv.production,
        once: argv.once,
        settingsFile: argv.settings,
        program: argv.program || undefined
      });
    }
  });

  Commands.push({
    name: "galaxy",
    help: "Interact with your galaxy server",
    // Remove this once Galaxy support is official.
    hidden: true,
    argumentParser: function (opt) {
      opt.usage(
        "Usage: meteor galaxy configure <sitename>\n" +
          "\n" +
          "Allows you to interact with a Galaxy server.\n");
    },
    func: function (argv) {
      var cmd = argv._.shift();
      switch (cmd) {
      case "configure":
        // We don't use galaxyCommand here because we want the tunnel to stay
        // open (galaxyCommand closes the tunnel as soon as the command finishes
        // running). The tunnel will be cleaned up when the process exits.
        if (argv._[0])
          argv._[0] = qualifySitename(argv._[0]);
        prepareForGalaxy(argv._[0], context, argv["ssh-identity"]);
        if (! context.galaxy) {
          process.stdout.write(
            "You must provide a galaxy to configure (by setting the GALAXY environment variable " +
              "or providing a sitename (meteor galaxy configure <sitename>).\n");
          process.exit(1);
        }
        console.log("Visit http://localhost:" + context.galaxy.port + "/panel to configure your galaxy");
        break;
      default:
        break;
      }
    }
  });

  Commands.push({
    name: "create",
    help: "Create a new project",
    argumentParser: function (opt) {
      opt.describe('example', 'Example template to use.')
        .boolean('list')
        .describe('list', 'Show list of available examples.')
        .usage(
          "Usage: meteor create [--release <release>] <name>\n" +
            "       meteor create [--release <release>] --example <example_name> [<name>]\n" +
            "       meteor create --list\n" +
            "\n" +
            "Make a subdirectory named <name> and create a new Meteor project\n" +
            "there. You can also pass an absolute or relative path.\n" +
            "\n" +
            "The project will use the release of Meteor specified with the --release\n" +
            "option, or the latest available version if the option is not specified.\n" +
            "\n" +
            "You can pass --example to start off with a copy of one of the Meteor\n" +
            "sample applications. Use --list to see the available examples.");
    },
    func: function (argv, showUsage) {
      var appPath;
      if (argv._.length === 1)
        appPath = argv._[0];
      else if (argv._.length === 0 && argv.example)
        appPath = argv.example;

      var example_dir = path.join(__dirname, '..', 'examples');
      var examples = _.reject(fs.readdirSync(example_dir), function (e) {
        return (e === 'unfinished' || e === 'other'  || e[0] === '.');
      });

      if (argv['list']) {
        process.stdout.write("Available examples:\n");
        _.each(examples, function (e) {
          process.stdout.write("  " + e + "\n");
        });
        process.stdout.write("\n" +
                             "Create a project from an example with 'meteor create --example <name>'.\n");
        process.exit(1);
      };

      if (!appPath) {
        showUsage();
      }

      if (fs.existsSync(appPath)) {
        process.stderr.write(appPath + ": Already exists\n");
        process.exit(1);
      }

      if (files.findAppDir(appPath)) {
        process.stderr.write(
          "You can't create a Meteor project inside another Meteor project.\n");
        process.exit(1);
      }

      var transform = function (x) {
        return x.replace(/~name~/g, path.basename(appPath));
      };

      if (argv.example) {
        if (examples.indexOf(argv.example) === -1) {
          process.stderr.write(argv.example + ": no such example\n\n");
          process.stderr.write("List available applications with 'meteor create --list'.\n");
          process.exit(1);
        } else {
          files.cp_r(path.join(example_dir, argv.example), appPath, {
            ignore: [/^local$/]
          });
        }
      } else {
        files.cp_r(path.join(__dirname, 'skel'), appPath, {
          transform_filename: function (f) {
            return transform(f);
          },
          transform_contents: function (contents, f) {
            if ((/(\.html|\.js|\.css)/).test(f))
              return new Buffer(transform(contents.toString()));
            else
              return contents;
          },
          ignore: [/^local$/]
        });
      }

      // Use the global release version, so that it isn't influenced by the
      // release version of the app dir you happen to be inside now.
      project.writeMeteorReleaseVersion(appPath, context.globalReleaseVersion);

      process.stderr.write(appPath + ": created");
      if (argv.example &&
          argv.example !== appPath)
        process.stderr.write(" (from '" + argv.example + "' template)");
      process.stderr.write(".\n\n");

      process.stderr.write(
        "To run your new app:\n" +
          "   cd " + appPath + "\n" +
          "   meteor\n");
    }
  });

  Commands.push({
    name: "update",
    help: "Upgrade this project to the latest version of Meteor",
    argumentParser: function (opt) {
      opt.boolean('dont-fetch-latest')
        .usage(
          "Usage: meteor update [--release <release>]\n" +
            "\n" +
            "Sets the version of Meteor to use with the current project. If a\n" +
            "release is specified with --release, set the project to use that\n" +
            "version. Otherwise download and use the latest release of Meteor.");
    },
    func: function (argv) {
      // refuse to update if we're in a git checkout.
      if (!files.usesWarehouse()) {
        logging.die(
          "update: can only be run from official releases, not from checkouts");
      }

      var didGlobalUpdateWithoutSpringboarding = false;
      var triedToGloballyUpdateButFailed = false;

      // Unless the user specified a specific release (or we're doing a
      // mid-update springboard), go get the latest release.
      if (!argv.release) {
        // Undocumented flag (used, eg, by upgrade-to-engine.js).
        if (!argv["dont-fetch-latest"]) {
          try {
            didGlobalUpdateWithoutSpringboarding =
              warehouse.fetchLatestRelease();
          } catch (e) {
            if (!(e instanceof files.OfflineError)) {
              console.error("Failed to update Meteor.");
              throw e;
            }
            // If the problem appears to be that we're offline, just log and
            // continue.
            console.log("Can't contact the update server. Are you online?");
            triedToGloballyUpdateButFailed = true;
          }
        }

        // we need to update the releaseManifest in the context because that's
        // what toolsSpringboard reads
        setReleaseVersion(warehouse.latestRelease());

        // If the tools for this release is different, then toolsSpringboard
        // execs and does not return. Otherwise, keeps going.
        toolsSpringboard(['--release=' + context.releaseVersion]);
      }

      // If we're not in an app, then we're done (other than maybe printing some
      // stuff).
      if (!context.appDir) {
        if (argv["dont-fetch-latest"])
          return;
        if (argv.release || didGlobalUpdateWithoutSpringboarding) {
          // If the user specified a specific release, or we just did a global
          // update (with springboarding, in which case --release is set, or
          // without springboarding, in which case didGlobalUpdate is set),
          // print this message.
          console.log("Installed. Run 'meteor update' inside of a particular project\n" +
                      "directory to update that project to Meteor %s.",
                      context.releaseVersion);
        } else {
          // The user just ran "meteor update" (without --release), and we did
          // not update.
          console.log("The latest version of Meteor, %s, is already installed on this\n" +
                      "computer. Run 'meteor update' inside of a particular project\n" +
                      "directory to update that project to Meteor %s.",
                      context.releaseVersion, context.releaseVersion);
        }
        return;
      }

      // Otherwise, we have to upgrade the app too, if the release changed.
      var appRelease = project.getMeteorReleaseVersion(context.appDir);
      if (appRelease !== null && appRelease === context.releaseVersion) {
        if (triedToGloballyUpdateButFailed) {
          console.log(
            "This project is already at Meteor %s, the latest release\n" +
              "installed on this computer.",
            context.releaseVersion);
        } else {
          console.log(
            "This project is already at Meteor %s, the latest release.",
            context.releaseVersion);
        }
        return;
      }

      // Write the release to .meteor/release.
      project.writeMeteorReleaseVersion(context.appDir,
                                        context.releaseVersion);

      // Find upgraders (in order) necessary to upgrade the app for the new
      // release (new metadata file formats, etc, or maybe even updating renamed
      // APIs). (If this is a pre-engine app with no .meteor/release file, run
      // all upgraders.)
      var oldManifest = appRelease === null ? {}
          : warehouse.ensureReleaseExistsAndReturnManifest(appRelease);
      // We can only run upgrades from pinned apps.
      if (oldManifest) {
        var upgraders = _.difference(context.releaseManifest.upgraders || [],
                                     oldManifest.upgraders || []);
        _.each(upgraders, function (upgrader) {
          require("./upgraders.js").runUpgrader(upgrader, context.appDir);
        });
      }

      // This is the right spot to do any other changes we need to the app in
      // order to update it for the new release .
      // XXX add app packages to .meteor/packages here for linker upgrade!
      console.log("%s: updated to Meteor %s.",
                  path.basename(context.appDir), context.releaseVersion);

      // Print any notices relevant to this upgrade.
      // XXX This doesn't include package-specific notices for packages that
      // are included transitively (eg, packages used by app packages).
      var packages = project.get_packages(context.appDir);
      warehouse.printNotices(appRelease, context.releaseVersion, packages);
    }
  });

  Commands.push({
    name: "run-upgrader",
    help: "Execute a specific upgrader by name. Intended for testing.",
    hidden: true,
    argumentParser: function (opt) {
      opt .usage(
        "Usage: meteor run-upgrader <upgrader>\n" +
          "\n" +
          "Runs a specific upgrader on the current app. This is for testing\n" +
          "internal functionality of Meteor.");
    },
    func: function (argv, showUsage) {
      if (argv._.length !== 1)
        showUsage();

      requireDirInApp("run-upgrader");

      var upgraders = require("./upgraders.js");
      console.log("%s: running upgrader %s.",
                  path.basename(context.appDir), argv._[0]);
      upgraders.runUpgrader(argv._[0], context.appDir);
    }
  });

  Commands.push({
    name: "add",
    help: "Add a package to this project",
    argumentParser: function (opt) {
      opt.usage("Usage: meteor add <package> [package] [package..]\n" +
            "\n" +
            "Adds packages to your Meteor project. You can add multiple\n" +
            "packages with one command. For a list of the available packages, see\n" +
            "'meteor list'.\n");
    },
    func: function (argv, showUsage) {
      if (_.isEmpty(argv._))
        showUsage();

      requireDirInApp('add');
      var all = context.library.list();
      var using = {};
      _.each(project.get_packages(context.appDir), function (name) {
        using[name] = true;
      });

      _.each(argv._, function (name) {
        if (!(name in all)) {
          process.stderr.write(name + ": no such package\n");
        } else if (name in using) {
          process.stderr.write(name + ": already using\n");
        } else {
          project.add_package(context.appDir, name);
          var note = all[name].metadata.summary || '';
          process.stderr.write(name + ": " + note + "\n");
        }
      });
    }
  });

  Commands.push({
    name: "remove",
    help: "Remove a package from this project",
    argumentParser: function (opt) {
      opt.usage("Usage: meteor remove <package> [package] [package..]\n" +
                "\n" +
                "Removes a package previously added to your Meteor project. For a\n" +
                "list of the packages that your application is currently using, see\n" +
                "'meteor list --using'.\n");
    },
    func: function (argv, showUsage) {
      if (_.isEmpty(argv._))
        showUsage();

      requireDirInApp('remove');
      var using = {};
      _.each(project.get_packages(context.appDir), function (name) {
        using[name] = true;
      });

      _.each(argv._, function (name) {
        if (!(name in using)) {
          process.stderr.write(name + ": not in project\n");
        } else {
          project.remove_package(context.appDir, name);
          process.stderr.write(name + ": removed\n");
        }
      });
    }
  });

  Commands.push({
    name: "list",
    help: "List available packages",
    argumentParser: function (opt) {
      opt.boolean("using")
        .usage("Usage: meteor list [--using]\n" +
               "\n" +
               "Without arguments, lists all available Meteor packages. To add one\n" +
               "of these packages to your project, see 'meteor add'.\n" +
               "\n" +
               "With --using, list the packages that you have added to your project.\n");
    },
    func: function (argv) {
      if (argv.using) {
        requireDirInApp('list --using');
        var using = project.get_packages(context.appDir);

        if (using.length) {
          _.each(using, function (name) {
            process.stdout.write(name + "\n");
          });
        } else {
          process.stderr.write(
            "This project doesn't use any packages yet. To add some packages:\n" +
              "  meteor add <package> <package> ...\n" +
              "\n" +
              "To see available packages:\n" +
              "  meteor list\n");
        }
        return;
      }

      requireDirInApp('list');
      var list = context.library.list();
      var names = _.keys(list);
      names.sort();
      var pkgs = [];
      _.each(names, function (name) {
        pkgs.push(list[name]);
      });
      process.stdout.write("\n" + library.formatList(pkgs) + "\n");
    }
  });

  Commands.push({
    name: "bundle",
    help: "Pack this project up into a tarball",
    argumentParser: function (opt) {
      opt.boolean('for-deploy')
        .boolean('debug')
        .describe('debug', "bundle in debug mode (don't minify, etc)")
        .usage("Usage: meteor bundle <output_file.tar.gz>\n" +
               "\n" +
               "Package this project up for deployment. The output is a tarball that\n" +
               "includes everything necessary to run the application. See README in\n" +
               "the tarball for details.\n");
    },
    func: function (argv, showUsage) {
      if (argv._.length !== 1)
        showUsage();

      // XXX if they pass a file that doesn't end in .tar.gz or .tgz,
      // add the former for them

      // XXX output, to stderr, the name of the file written to (for
      // human comfort, especially since we might change the name)

      // XXX name the root directory in the bundle based on the basename
      // of the file, not a constant 'bundle' (a bit obnoxious for
      // machines, but worth it for humans)

      requireDirInApp("bundle");
      var buildDir = path.join(context.appDir, '.meteor', 'local', 'build_tar');
      var bundle_path = path.join(buildDir, 'bundle');
      var output_path = path.resolve(argv._[0]); // get absolute path

      var bundler = require(path.join(__dirname, 'bundler.js'));
      var bundleResult = bundler.bundle(context.appDir, bundle_path, {
        nodeModulesMode: argv['for-deploy'] ? 'skip' : 'copy',
        minify: !argv.debug,
        releaseStamp: context.releaseVersion,
        library: context.library
      });
      if (bundleResult.errors) {
        process.stdout.write("Errors prevented bundling:\n");
        process.stdout.write(bundleResult.errors.formatMessages());
        process.exit(1);
      }

      try {
        files.createTarball(path.join(buildDir, 'bundle'), output_path);
      } catch (err) {
        console.log(JSON.stringify(err));
        process.stderr.write("Couldn't create tarball\n");
      }
      files.rm_recursive(buildDir);
    }
  });

  Commands.push({
    name: "mongo",
    help: "Connect to the Mongo database for the specified site",
    argumentParser: function (opt) {
        opt.boolean('url')
        .boolean('U')
        .alias('url', 'U')
        .describe('url', 'return a Mongo database URL')
        .usage(
          "Usage: meteor mongo [--url] [site]\n" +
            "\n" +
            "Opens a Mongo shell to view or manipulate collections.\n" +
            "\n" +
            "If site is specified, this is the hosted Mongo database for the deployed\n" +
            "Meteor site.\n" +
            "\n" +
            "If no site is specified, this is the current project's local development\n" +
            "database.  In this case, the current working directory must be a\n" +
            "Meteor project directory, and the Meteor application must already be\n" +
            "running.\n" +
            "\n" +
            "Instead of opening a shell, specifying --url (-U) will return a URL\n" +
            "suitable for an external program to connect to the database.  For remote\n" +
            "databases on deployed applications, the URL is valid for one minute.\n"
        );
    },

    func: galaxyCommand(function (argv, showUsage) {
      if (argv._.length > 1)
        showUsage();

      var mongoUrl;

      if (argv._.length === 0) {
        // localhost mode
        var fut = new Future();
        find_mongo_port("mongo", function (mongod_port) {
          if (!mongod_port) {
            process.stdout.write(
              "mongo: Meteor isn't running.\n" +
                "\n" +
                "This command only works while Meteor is running your application\n" +
                "locally. Start your application first.\n");
            process.exit(1);
          }

          fut.return("mongodb://127.0.0.1:" + mongod_port + "/meteor");
        });
        mongoUrl = fut.wait();

      } else {
        var site = argv._[0];
        // remote mode
        if (context.galaxy) {
          mongoUrl = deployGalaxy.temporaryMongoUrl({
            app: site,
            context: context
          });
        } else {
          mongoUrl = deploy.temporaryMongoUrl(site);
        }
      }
      if (argv.url) {
        console.log(mongoUrl);
      } else {
        process.stdin.pause();
        deploy.run_mongo_shell(mongoUrl);
      }
    })
  });

  Commands.push({
    name: "deploy",
    help: "Deploy this project to Meteor",
    argumentParser: function (opt) {
      opt.alias('password', 'P')
        .boolean('password')
        .boolean('P')
        .describe('password', 'set a password for this deployment')
        .alias('delete', 'D')
        .boolean('delete')
        .boolean('D')
        .describe('delete', "permanently delete this deployment")
        .boolean('debug')
        .describe('debug', 'deploy in debug mode (don\'t minify, etc)')
        .describe('settings', 'set optional data for Meteor.settings')
        .alias('ssh-identity', 'i')
        .describe('ssh-identity', 'Selects a file from which the identity (private key) is read. See ssh(1) for details.')
        .describe('star', 'a star (tarball) to deploy instead of the current meteor app')
        .boolean('admin')
      // Shouldn't be documented until the Galaxy release
      //.describe('admin', 'Marks the application as an admin app, it will be available in Galaxy admin interface.')
        .usage(
          "Usage: meteor deploy <site> [--password] [--settings settings.json] [--debug] [--delete]\n" +
            "\n" +
            "Deploys the project in your current directory to Meteor's servers.\n" +
            "\n" +
            "You can deploy to any available name under 'meteor.com'\n" +
            "without any additional configuration, for example,\n" +
            "'myapp.meteor.com'. If you deploy to a custom domain, such as\n" +
            "'myapp.mydomain.com', then you'll also need to configure your domain's\n" +
            "DNS records. See the Meteor docs for details.\n" +
            "\n" +
            "The --settings flag can be used to pass deploy-specific information to\n" +
            "the application. It will be available at runtime in Meteor.settings, but only\n" +
            "on the server. If the object contains a key named 'public', then\n" +
            "Meteor.settings.public will also be available on the client. The argument\n" +
            "is the name of a file containing the JSON data to use. The settings will\n" +
            "persist across deployments until you again specify a settings file. To\n" +
            "unset Meteor.settings, pass an empty settings file.\n" +
            "\n" +
            "The --delete flag permanently removes a deployed application, including\n" +
            "all of its stored data.\n" +
            "\n" +
            "The --password flag sets an administrative password for the domain. Once\n" +
            "set, any subsequent 'deploy', 'logs', or 'mongo' command will prompt for\n" +
            "the password. You can change the password with a second 'deploy' command.\n"
          // Shouldn't be documented until the Galaxy release
          //"\n" +
          //"The --admin flag marks application as administrative to Galaxy interface.\n" +
          //"Application's web-interface will be accessible from admin's panel only.\n"
        );
    },
    func: galaxyCommand(function (argv, showUsage) {
      if (argv._.length !== 1)
        showUsage();

      var site = argv._[0];

      if (argv.delete) {
        if (context.galaxy)
          deployGalaxy.deleteApp(site, context);
        else
          deploy.delete_app(site);
      } else {
        var starball = argv.star;
        // We don't need to be in an app if we're not going to run the bundler.
        if (!starball)
          requireDirInApp("deploy");
        var settings = undefined;
        if (argv.settings)
          settings = runner.getSettings(argv.settings);

        if (context.galaxy) {
          if (argv.password) {
            process.stderr.write("Galaxy does not support --password.\n");
            process.exit(1);
          }

          deployGalaxy.deploy({
            app: site,
            appDir: context.appDir,
            settings: settings,
            context: context,
            starball: starball,
            bundleOptions: {
              nodeModulesMode: 'skip',
              minify: !argv.debug,
              releaseStamp: context.releaseVersion,
              library: context.library
            },
            admin: argv.admin
          });
        } else {
          deploy.deployCmd({
            url: site,
            appDir: context.appDir,
            settings: settings,
            setPassword: !!argv.password,
            bundleOptions: {
              nodeModulesMode: 'skip',
              minify: !argv.debug,
              releaseStamp: context.releaseVersion,
              library: context.library
            }
          });
        }
      }
    })
  });

  Commands.push({
    name: "logs",
    help: "Show logs for specified site",
    argumentParser: function (opt) {
      opt.boolean('f')
      // XXX once Galaxy is released, document -f
        .usage("Usage: meteor logs <site>\n" +
               "\n" +
               "Retrieves the server logs for the requested site.\n");
    },
    func: function (argv, showUsage) {
      if (argv._.length !== 1)
        showUsage();

      // We don't use galaxyCommand here because we want the tunnel to stay
      // open (galaxyCommand closes the tunnel as soon as the command finishes
      // running). The tunnel will be cleaned up when the process exits.
      var site = qualifySitename(argv._[0]);
      var tunnel = prepareForGalaxy(site, context, argv["ssh-identity"]);
      var useGalaxy = !!context.galaxy;

      if (useGalaxy) {
        var streaming = !!argv.f;
        deployGalaxy.logs({
          context: context,
          app: site,
          streaming: streaming
        });
        if (! streaming && tunnel)
          killTunnel(tunnel);
      } else {
        deploy.logs(site);
      }
    }
  });

  Commands.push({
    name: "reset",
    help: "Reset the project state. Erases the local database.",
    argumentParser: function (opt) {
      opt.usage("Usage: meteor reset\n" +
                "\n" +
                "Reset the current project to a fresh state. Removes all local\n" +
                "data and kills any running meteor development servers.\n");
    },
    func: function (argv) {
      if (!_.isEmpty(argv._)) {
        process.stdout.write("meteor reset only affects the locally stored database.\n\n" +
                             "To reset a deployed application use\nmeteor deploy --delete appname\n" +
                             "followed by\nmeteor deploy appname\n");
        process.exit(1);
      }

      find_mongo_port("reset", function (mongod_port) {
        if (mongod_port) {
          process.stdout.write(
            "reset: Meteor is running.\n" +
              "\n" +
              "This command does not work while Meteor is running your application.\n" +
              "Exit the running meteor development server.\n");
          process.exit(1);
        }

        var local_dir = path.join(context.appDir, '.meteor', 'local');
        files.rm_recursive(local_dir);

        process.stdout.write("Project reset.\n");
      });
    }
  });

  Commands.push({
    name: "test-packages",
    help: "Test one or more packages",
    argumentParser: function (opt) {
      // This help logic should probably move to run.js eventually
      opt .alias('port', 'p').default('port', 3000)
        .describe('port', 'Port to listen on. NOTE: Also uses port N+1 and N+2.')
        .describe('deploy', 'Optionally, specify a domain to deploy to, rather than running locally.')
        .boolean('production')
        .describe('production', 'Run in production mode. Minify and bundle CSS and JS files.')
        .boolean('once') // See #Once
        // To ensure that QA covers both PollingObserveDriver and
        // OplogObserveDriver, this option disables oplog for tests.
        // (It still creates a replset, it just doesn't do oplog tailing.)
        .boolean('disable-oplog')
        .describe('settings',  'Set optional data for Meteor.settings on the server')
        .usage(
          "Usage: meteor test-packages [--release <release>] [options] [package...]\n" +
            "\n" +
            "Runs unit tests for one or more packages. The results are shown in\n" +
            "a browser dashboard that updates whenever a relevant source file is\n" +
            "modified.\n" +
            "\n" +
            "Packages may be specified by name or by path. If a package argument\n" +
            "contains a '/', it is loaded from a directory of that name; otherwise,\n" +
            "the package name is resolved according to the usual package search\n" +
            "algorithm ('packages' subdirectory of the current app, $PACKAGE_DIRS\n" +
            "directories, and core packages in that order). You can test any number\n" +
            "of packages simultaneously. If you don't specify any package names\n" +
            "then all available packages will be tested.\n" +
            "\n" +
            "Open the test dashboard in your browser to run the tests and see the\n" +
            "results. By default the URL is localhost:3000 but that can be changed\n" +
            "with --port. Alternatively, you can deploy the tests onto the 'meteor\n" +
            "deploy' server by using --deploy. This gives you a public URL that you\n" +
            "can use in conjunction with a service like Browserling or BrowserStack\n" +
            "to try the tests against many different browser versions.");
    },
    func: function (argv) {
      var testPackages;
      if (_.isEmpty(argv._)) {
        // XXX The call to list() here is unfortunate, because list()
        // can fail (eg, a package has a parse error) and if it does
        // we currently just exit! Which sucks because we don't get
        // reloading.
        testPackages = _.keys(context.library.list());
      } else {
        testPackages = _.map(argv._, function (p) {
          // If it's a package name, the bundler will resolve it using
          // context.packageSearchOptions later.
          if (p.indexOf('/') === -1)
            return p;

          // Otherwise it's a directory; load it into a Package now. Use
          // path.resolve to strip trailing slashes, so that packageName doesn't
          // have a trailing slash.
          var packageDir = path.resolve(p);
          var packageName = path.basename(packageDir);
          context.library.override(packageName, packageDir);
          return packageName;
        });
      }

      // Make a temporary app dir (based on the test runner app). This will be
      // cleaned up on process exit. Using a temporary app dir means that we can
      // run multiple "test-packages" commands in parallel without them stomping
      // on each other.
      //
      // Note: context.appDir now is DIFFERENT from
      // bundleOptions.library.appDir: we are bundling the test
      // runner app, but finding app packages from the current app (if any).
      context.appDir = files.mkdtemp('meteor-test-run');
      files.cp_r(path.join(__dirname, 'test-runner-app'), context.appDir);
      // Undocumented flag to use a different test driver.
      project.add_package(context.appDir,
                          argv['driver-package'] || 'test-in-browser');

      if (argv.deploy) {
        var deployOptions = {
          site: argv.deploy
        };
        deploy.deployToServer(context.appDir, {
          nodeModulesMode: 'skip',
          testPackages: testPackages,
          minify: argv.production,
          releaseStamp: context.releaseVersion,
          library: context.library
        }, {
          site: argv.deploy,
          settings: argv.settings && runner.getSettings(argv.settings)
        });
      } else {
        runner.run(context, {
          port: argv.port,
          minify: argv.production,
          once: argv.once,
          disableOplog: argv['disable-oplog'],
          testPackages: testPackages,
          settingsFile: argv.settings,
          banner: "Tests"
        });
      }
    }
  });

  Commands.push({
    name: "rebuild-all",
    help: "Rebuild all packages",
    hidden: true,
    argumentParser: function (opt) {
      opt.usage("Usage: meteor rebuild-all\n" +
                "\n" +
                "Rebuild all source packages in the library. This includes packages found\n" +
                "through the PACKAGE_DIRS environment variable, local packages in the \n" +
                "current application, and packages in the warehouse (but only those in the\n" +
                "currently effective Meteor release.) It doesn't include any packages for\n" +
                "which we don't have the source.\n" +
                "\n" +
                "You should never need to use this command. It is intended for use while\n" +
                "debugging the Meteor packaging tools themselves.\n");
    },
    func: function (argv, showUsage) {
      if (argv._.length !== 0)
        showUsage();

      if (context.appDir) {
        // The library doesn't know about other programs in your app. Let's blow
        // away their .build directories if they have them, and not rebuild
        // them. Sort of hacky, but eh.
        var programsDir = path.join(context.appDir, 'programs');
        try {
          var programs = fs.readdirSync(programsDir);
        } catch (e) {
          // OK if the programs directory doesn't exist; that'll just leave
          // 'programs' empty.
          if (e.code !== "ENOENT")
            throw e;
        }
        _.each(programs, function (program) {
          files.rm_recursive(path.join(programsDir, program, '.build'));
        });
      }

      var count = null;
      var messages = buildmessage.capture(function () {
        count = context.library.rebuildAll();
      });
      if (count)
        console.log("Built " + count + " packages.");
      if (messages.hasMessages()) {
        process.stdout.write("\n" + messages.formatMessages());
        process.exit(1);
      }
    }
  });

  Commands.push({
    name: "run-command",
    help: "Build and run a command-line tool",
    hidden: true,
    argumentParser: function (opt) {
      // This command does things manually. See below.
    },
    func: function (argv) {
      // At this point options such as --help have already been parsed
      // out.. that's no good. We'll have to go back tho the original
      // process.argv and parse it ourselves.
      argv = process.argv;
      argv = argv.slice(argv.indexOf("run-command") + 1);
      if (! argv.length || argv[0] === "--help") {
        process.stdout.write(
"Usage: meteor run-command <package directory> [arguments..]\n" +
"\n" +
"Builds the provided directory as a package, then loads the package and\n" +
"calls the main() function inside the package. The function will receive\n" +
"any remaining arguments. The exit status will be the return value of\n" +
"main() (which is called inside a fiber).\n" +
"\n" +
"This command is for temporary, internal use, until we have a more mature\n" +
"system for building standalone command-line programs with Meteor.\n");
        process.exit(1);
      }

      if (! fs.existsSync(argv[0]) ||
          ! fs.statSync(argv[0]).isDirectory()) {
        process.stderr.write(argv[0] + ": not a directory\n");
        process.exit(1);
      }

      // Build and load the package
      var world, packageName;
      var messages = buildmessage.capture(
        { title: "building the program" }, function () {
          // Make the directory visible as a package. Derive the last
          // package name from the last component of the directory, and
          // bail out if that creates a conflict.
          var packageDir = path.resolve(argv[0]);
          packageName = path.basename(packageDir) + "-tool";
          if (context.library.get(packageName, false)) {
            process.stderr.write("'" + packageName +
                                 "' conflicts with the name " +
                                 "of a package in the library");
            process.exit(1);
          }
          context.library.override(packageName, packageDir);

          world = unipackage.load({
            library: context.library,
            packages: [ packageName ],
            release: context.releaseVersion
          });
        });
      if (messages.hasMessages()) {
        process.stderr.write(messages.formatMessages());
        process.exit(1);
      }

      if (! ('main' in world[packageName])) {
        process.stderr.write("Package does not define a main() function.\n");
        process.exit(1);
      }

      var ret = world[packageName].main(argv.slice(1));
      // let exceptions propagate and get printed by node
      if (ret === undefined)
        ret = 0;
      if (typeof ret !== "number")
        ret = 1;
      ret = +ret; // cast to integer
      process.exit(ret);
    }
  });

  // Prints a message if $METEOR_TOOLS_DEBUG is set.
  // XXX We really should have a better logging system.
  var toolsDebugMessage = function (msg) {
    if (process.env.METEOR_TOOLS_DEBUG)
      console.log("[TOOLS DEBUG] " + msg);
  };

  // As the first step of running the Meteor CLI, check which Meteor
  // release we should be running against. Then, check whether the
  // tools corresponding to that release is the same as the one
  // we're running. If not, springboard to the right tools (after
  // having fetched it to the local warehouse)
  var toolsSpringboard = function (extraArgs) {
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

  // Implements --version. Note that we only print to stdout and exit 0 if
  // there's actually a specific release.
  var printVersion = function () {
    if (!files.usesWarehouse()) {
      logging.die("Unreleased (running from a checkout)");
    }

    if (context.appReleaseVersion === "none") {
      logging.die(
        "This project was created with a checkout of Meteor, rather than an\n" +
        "official release, and doesn't have a release number associated with\n" +
        "it. You can set its release with 'meteor update'.");
    }
    console.log("Release " + context.releaseVersion);
    process.exit(0);
  };

  // Implements --built-by
  var printBuiltBy = function () {
    var packages = require('./packages.js');
    console.log(packages.BUILT_BY);
    process.exit(0);
  };

  // Implements --arch.
  var printArch = function () {
    var archinfo = require('./archinfo.js');
    console.log(archinfo.host());
    process.exit(0);
  };

  // Implements "meteor --get-ready", which you run to ensure that your
  // checkout's Meteor is "complete" (dev bundle downloaded and all NPM modules
  // installed).
  var getReady = function () {
    if (files.usesWarehouse()) {
      logging.die("meteor --get-ready only works in a checkout");
    }
    // dev bundle is downloaded by the wrapper script. We just need to install
    // NPM dependencies.
    _.each(context.library.list(), function (p) {
      p.preheat();
    });
    process.exit(0);
  };

  var main = function() {
    var optimist = require('optimist')
          .alias("h", "help")
          .boolean("h")
          .boolean("help")
          .boolean("version")
          .boolean("built-by")
          .boolean("arch")
          .boolean("debug")
          .alias("i", "ssh-identity");

    var argv = optimist.argv;

    calculateContext(argv);

    // if we're not running the correct tools, fetch it and re-run. do *not* do
    // this if we are in a checkout, or if
    // process.env.METEOR_TEST_NO_SPRINGBOARD is set. This hook allows unit
    // tests to test the current tools's ability to run other releases. Also,
    // don't do this if we are in the middle of an update that springboarded.
    if (!files.in_checkout() && !process.env.METEOR_TEST_NO_SPRINGBOARD)
      toolsSpringboard();

    if (argv['get-ready']) {
      getReady();
      return;
    }

    if (argv._[0] === "help") {
      argv._.shift();
      argv.help = true;
    }

    if (argv['built-by']) {
      printBuiltBy();
      return;
    }

    if (argv.version) {
      printVersion();
      return;
    }

    if (argv.arch) {
      printArch();
      return;
    }

    var cmd = null;
    if (argv._.length)
      cmd = argv._[0];

    if (PROFILE_REQUIRE)
      require('./profile-require.js').printReport();

    if (argv.help && (!cmd || cmd === "help"))
      usage();

    runCommand(cmd, argv.help);
  };

  main();
}).run();
