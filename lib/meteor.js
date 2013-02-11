var Fiber = require('fibers');
Fiber(function () {

  var path = require('path');
  var files = require(path.join(__dirname, 'files.js'));
  var _ = require('underscore');
  var deploy = require(path.join(__dirname, 'deploy'));
  var fs = require("fs");
  var runner = require(path.join(__dirname, 'run.js'));
  var packages = require(path.join(__dirname, 'packages.js'));
  var warehouse = require(path.join(__dirname, 'warehouse.js'));

  // This code is duplicated in app/server/server.js.
  var MIN_NODE_VERSION = 'v0.8.18';
  if (require('semver').lt(process.version, MIN_NODE_VERSION)) {
    process.stderr.write(
      'Meteor requires Node ' + MIN_NODE_VERSION + ' or later.\n');
    process.exit(1);
  }

  var usage = function() {
    process.stdout.write(
      "Usage: meteor [--version] [--help] <command> [<args>]\n" +
        "\n" +
        "With no arguments, 'meteor' runs the project in the current\n" +
        "directory in local development mode. You can run it from the root\n" +
        "directory of the project or from any subdirectory.\n" +
        "\n" +
        "Use 'meteor create <name>' to create a new Meteor project.\n" +
        "\n" +
        "Commands:\n");
    _.each(Commands, function (cmd) {
      if (cmd.help) {
        var name = cmd.name + "           ".substr(cmd.name.length);
        process.stdout.write("   " + name + cmd.help + "\n");
      }
    });
    process.stdout.write("\n");
    process.stdout.write(
      "See 'meteor help <command>' for details on a command.\n");
    process.exit(1);
  };

  // Looks up the directory tree from the current working directory
  // to find an app directory. If not found, print an error message.
  //
  // @param cmd {String} The command that was run. Used when printing
  //   error message.
  var requireDirInApp = function (cmd) {
    var app_dir = files.find_upwards(files.is_app_dir);
    if (app_dir) {
      return app_dir;
    } else {
      // This is where you end up if you type 'meteor' with no
      // args. Be gentle to the noobs..
      process.stdout.write(
        cmd + ": You're not in a Meteor project directory.\n" +
          "\n" +
          "To create a new Meteor project:\n" +
          "   meteor create <project name>\n" +
          "For example:\n" +
          "   meteor create myapp\n" +
          "\n" +
          "For more help, see 'meteor --help'.\n");
      process.exit(1);
      return false; // no need for this since we exit(), but makes jslint happy
    }
  };

  var find_mongo_port = function (cmd, callback) {
    var app_dir = requireDirInApp(cmd);
    var mongo_runner = require(path.join(__dirname, 'mongo_runner.js'));
    mongo_runner.find_mongo_port(app_dir, callback);
  };

  Commands = [];

  var findCommand = function (name) {
    for (var i = 0; i < Commands.length; i++)
      if (Commands[i].name === name)
        return Commands[i];
    process.stdout.write("'" + name + "' is not a Meteor command. See " +
                         "'meteor --help'.\n");
    process.exit(1);
  };

  // XXX when the pass unexpected argument or unrecognized flags, print
  // an error and fail out

  Commands.push({
    name: "run",
    help: "[default] Run this project in local development mode",
    func: function (argv) {
      // reparse args
      // This help logic should probably move to run.js eventually
      var opt = require('optimist')
            .alias('port', 'p').default('port', 3000)
            .describe('port', 'Port to listen on. NOTE: Also uses port N+1 and N+2.')
            .boolean('production')
            .describe('production', 'Run in production mode. Minify and bundle CSS and JS files.')
            .describe('settings',  'Set optional data for Meteor.settings on the server')
            // With --once, meteor does not re-run the project if it crashes and
            // does not monitor for file changes. Intentionally undocumented:
            // intended for automated testing (eg, cli-test.sh), not end-user
            // use.
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

      var new_argv = opt.argv;

      if (argv.help) {
        process.stdout.write(opt.help());
        process.exit(1);
      }

      var app_dir = path.resolve(requireDirInApp("run"));
      var bundle_opts = { noMinify: !new_argv.production, nodeModulesMode: 'symlink' };
      runner.run(app_dir, bundle_opts, new_argv.port, new_argv.once, new_argv.settings);
    }
  });

  Commands.push({
    name: "test-packages",
    help: "Test one or more packages",
    func: function (argv) {
      // reparse args
      // This help logic should probably move to run.js eventually
      var opt = require('optimist')
            .alias('port', 'p').default('port', 3000)
            .describe('port', 'Port to listen on. NOTE: Also uses port N+1 and N+2.')
            .describe('release', 'Meteor release version to test.')
            .describe('deploy', 'Optionally, specify a domain to deploy to instead of running locally.')
            .usage(
              "Usage: meteor test-packages [options] [comma delimited packages]\n" +
                "\n" +
                "Run unit tests for packages. Point your browser to localhost:3000 to see results.");

      var new_argv = opt.argv;

      if (argv.help) {
        process.stdout.write(opt.help());
        process.exit(1);
      }

      var packages = require(path.join(__dirname, 'packages.js'));
      var releaseVersion = new_argv['release'];

      var testPackages;
      if (new_argv._[1]) {
        testPackages = new_argv._[1].split(',');
      } else {
        if (releaseVersion) {
          var manifest = warehouse.manifestForRelease(releaseVersion);
          testPackages = _.keys(packages.list(manifest));
        } else {
          testPackages = _.keys(packages.list());
        }
      }

      var bundleOptions = {
        nodeModulesMode: new_argv.deploy ? 'skip' : 'symlink',
        testPackages: testPackages,
        versionOverride: releaseVersion
      };
      app_dir = path.join(__dirname, 'test-runner-app');

      if (new_argv.deploy) {
        var deployOptions = {
          site: new_argv.deploy
        };
        deploy.deployToServer(app_dir, bundleOptions, deployOptions);
      } else {
        runner.run(app_dir, bundleOptions, new_argv.port);
      }
    }
  });

  Commands.push({
    name: "help",
    func: function (argv) {
      if (!argv._.length || argv.help)
        usage();
      var cmd = argv._.splice(0,1)[0];
      argv.help = true;
      findCommand(cmd).func(argv);
    }
  });

  Commands.push({
    name: "create",
    help: "Create a new project",
    func: function (argv) {
      // reparse args
      var opt = require('optimist')
            .describe('example', 'Example template to use.')
            .boolean('list')
            .describe('list', 'Show list of available examples.')
            .usage(
              "Usage: meteor create <name>\n" +
                "       meteor create --example <example_name> [<name>]\n" +
                "       meteor create --list\n" +
                "\n" +
                "Make a subdirectory named <name> and create a new Meteor project\n" +
                "there. You can also pass an absolute or relative path.\n" +
                "\n" +
                "You can pass --example to start off with a copy of one of the Meteor\n" +
                "sample applications. Use --list to see the available examples.");

      var new_argv = opt.argv;
      var appname;

      var example_dir = path.join(__dirname, '..', 'examples');
      var examples = _.reject(fs.readdirSync(example_dir), function (e) {
        return (e === 'unfinished' || e === 'other'  || e[0] === '.');
      });

      if (argv._.length === 1) {
        appname = argv._[0];
      } else if (argv._.length === 0 && new_argv.example) {
        appname = new_argv.example;
      }

      if (new_argv['list']) {
        process.stdout.write("Available examples:\n");
        _.each(examples, function (e) {
          process.stdout.write("  " + e + "\n");
        });
        process.stdout.write("\n" +
                             "Create a project from an example with 'meteor create --example <name>'.\n")
        process.exit(1);
      };

      if (argv.help || !appname) {
        process.stdout.write(opt.help());
        process.exit(1);
      }

      if (fs.existsSync(appname)) {
        process.stderr.write(appname + ": Already exists\n");
        process.exit(1);
      }

      if (files.find_app_dir(appname)) {
        process.stderr.write(
          "You can't create a Meteor project inside another Meteor project.\n");
        process.exit(1);
      }

      var transform = function (x) {
        return x.replace(/~name~/g, path.basename(appname));
      };

      if (new_argv.example) {
        if (examples.indexOf(new_argv.example) === -1) {
          process.stderr.write(new_argv.example + ": no such example\n\n");
          process.stderr.write("List available applications with 'meteor create --list'.\n");
          process.exit(1);
        } else {
          files.cp_r(path.join(example_dir, new_argv.example), appname, {
            ignore: [/^local$/]
          });
        }
      } else {
        files.cp_r(path.join(__dirname, 'skel'), appname, {
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

      process.stderr.write(appname + ": created");
      if (new_argv.example &&
          new_argv.example !== appname)
        process.stderr.write(" (from '" + new_argv.example + "' template)");
      process.stderr.write(".\n\n");

      process.stderr.write(
        "To run your new app:\n" +
          "   cd " + appname + "\n" +
          "   meteor\n");
    }
  });

  Commands.push({
    name: "update",
    help: "Upgrade to the latest version of Meteor",
    func: function (argv) {
      if (argv.help) {
        process.stdout.write(
          "Usage: meteor update\n" +
            "\n" +
            "Checks to see if a new version of Meteor is available, and if so,\n" +
            "downloads and installs it. You must be connected to the internet.\n");
        process.exit(1);
      }

      require(path.join(__dirname, 'update.js'));
    }
  });

  Commands.push({
    name: "add",
    help: "Add a package to this project",
    func: function (argv) {
      if (argv.help || !argv._.length) {
        process.stdout.write(
          "Usage: meteor add <package> [package] [package..]\n" +
            "\n" +
            "Adds packages to your Meteor project. You can add multiple\n" +
            "packages with one command. For a list of the available packages, see\n" +
            "'meteor list'.\n");
        process.exit(1);
      }

      var app_dir = requireDirInApp('add');
      var packages = require(path.join(__dirname, 'packages.js'));
      var project = require(path.join(__dirname, 'project.js'));
      var manifest = warehouse.manifestForApp(app_dir);
      var all = packages.list(manifest);
      var using = {};
      _.each(project.get_packages(app_dir), function (name) {
        using[name] = true;
      });

      _.each(argv._, function (name) {
        if (!(name in all)) {
          process.stderr.write(name + ": no such package\n");
        } else if (name in using) {
          process.stderr.write(name + ": already using\n");
        } else {
          project.add_package(app_dir, name);
          var note = all[name].metadata.summary || '';
          process.stderr.write(name + ": " + note + "\n");
        }
      });
    }
  });

  Commands.push({
    name: "remove",
    help: "Remove a package from this project",
    func: function (argv) {
      if (argv.help || !argv._.length) {
        process.stdout.write(
          "Usage: meteor remove <package> [package] [package..]\n" +
            "\n" +
            "Removes a package previously added to your Meteor project. For a\n" +
            "list of the packages that your application is currently using, see\n" +
            "'meteor list --using'.\n");
        process.exit(1);
      }

      var app_dir = requireDirInApp('remove');
      var packages = require(path.join(__dirname, 'packages.js'));
      var project = require(path.join(__dirname, 'project.js'));
      var using = {};
      _.each(project.get_packages(app_dir), function (name) {
        using[name] = true;
      });

      _.each(argv._, function (name) {
        if (!(name in using)) {
          process.stderr.write(name + ": not in project\n");
        } else {
          project.remove_package(app_dir, name);
          process.stderr.write(name + ": removed\n");
        }
      });
    }
  });

  Commands.push({
    name: "list",
    help: "List available packages",
    func: function (argv) {
      if (argv.help) {
        process.stdout.write(
          "Usage: meteor list [--using]\n" +
            "\n" +
            "Without arguments, lists all available Meteor packages. To add one\n" +
            "of these packages to your project, see 'meteor add'.\n" +
            "\n" +
            "With --using, list the packages that you have added to your project.\n");
        process.exit(1);
      }

      if (argv.using) {
        var app_dir = requireDirInApp('list --using');
        var using = require(path.join(__dirname, 'project.js')).get_packages(app_dir);

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
      } else {
        var app_dir = requireDirInApp('list');
      }

      var packages = require(path.join(__dirname, 'packages.js'));
      var manifest = warehouse.manifestForApp(app_dir);
      var list = packages.list(manifest);
      var names = _.keys(list);
      names.sort();
      var pkgs = [];
      _.each(names, function (name) {
        pkgs.push(list[name]);
      });
      process.stdout.write("\n" +
                           require(path.join(__dirname, 'packages.js')).format_list(pkgs) +
                           "\n");
    }
  });

  Commands.push({
    name: "bundle",
    help: "Pack this project up into a tarball",
    func: function (argv) {
      if (argv.help || argv._.length != 1) {
        process.stdout.write(
          "Usage: meteor bundle <output_file.tar.gz>\n" +
            "\n" +
            "Package this project up for deployment. The output is a tarball that\n" +
            "includes everything necessary to run the application. See README in\n" +
            "the tarball for details.\n");
        process.exit(1);
      }

      // XXX if they pass a file that doesn't end in .tar.gz or .tgz,
      // add the former for them

      // XXX output, to stderr, the name of the file written to (for
      // human comfort, especially since we might change the name)

      // XXX name the root directory in the bundle based on the basename
      // of the file, not a constant 'bundle' (a bit obnoxious for
      // machines, but worth it for humans)

      var app_dir = path.resolve(requireDirInApp("bundle"));
      var build_dir = path.join(app_dir, '.meteor', 'local', 'build_tar');
      var bundle_path = path.join(build_dir, 'bundle');
      var output_path = path.resolve(argv._[0]); // get absolute path

      var bundler = require(path.join(__dirname, 'bundler.js'));
      var errors = bundler.bundle(app_dir, bundle_path, {nodeModulesMode: 'copy'});
      if (errors) {
        process.stdout.write("Errors prevented bundling:\n");
        _.each(errors, function (e) {
          process.stdout.write(e + "\n");
        });
        files.rm_recursive(build_dir);
        process.exit(1);
      }

      var out = fs.createWriteStream(output_path);

      out.on('error', function (err) {
        console.log(JSON.stringify(err));
        process.stderr.write("Couldn't create tarball\n");
      });
      out.on('close', function () {
        files.rm_recursive(build_dir);
      });

      files.createTarGzStream(path.join(build_dir, 'bundle')).pipe(out);
    }
  });

  Commands.push({
    name: "mongo",
    help: "Connect to the Mongo database for the specified site",
    func: function (argv) {
      var opt = require('optimist')
            .boolean('url')
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

      if (argv.help) {
        process.stdout.write(opt.help());
        process.exit(1);
      }

      var new_argv = opt.argv;

      if (new_argv._.length === 1) {
        // localhost mode
        find_mongo_port("mongo", function (mongod_port) {
          if (!mongod_port) {
            process.stdout.write(
              "mongo: Meteor isn't running.\n" +
                "\n" +
                "This command only works while Meteor is running your application\n" +
                "locally. Start your application first.\n");
            process.exit(1);
          }

          var mongo_url = "mongodb://127.0.0.1:" + mongod_port + "/meteor";

          if (new_argv.url)
            console.log(mongo_url);
          else
            deploy.run_mongo_shell(mongo_url);
        });

      } else if (new_argv._.length === 2) {
        // remote mode
        deploy.mongo(new_argv._[1], new_argv.url);

      } else {
        // usage
        process.stdout.write(opt.help());
        process.exit(1);
      }
    }
  });

  Commands.push({
    name: "deploy",
    help: "Deploy this project to Meteor",
    func: function (argv) {
      var opt = require('optimist')
            .alias('password', 'P')
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
                "the password. You can change the password with a second 'deploy' command."
            );

      var new_argv = opt.argv;

      if (argv.help || new_argv._.length != 2) {
        process.stdout.write(opt.help());
        process.exit(1);
      }

      if (new_argv.delete) {
        deploy.delete_app(new_argv._[1]);
      } else {
        var settings = undefined;
        if (new_argv.settings)
          settings = runner.getSettings(new_argv.settings);
        var project_dir = path.resolve(requireDirInApp("deploy"));
        deploy.deployCmd(new_argv._[1], project_dir, new_argv.debug,
                          new_argv.password, settings);
      }
    }
  });

  Commands.push({
    name: "logs",
    help: "Show logs for specified site",
    func: function (argv) {
      if (argv.help || argv._.length < 1 || argv._.length > 2) {
        process.stdout.write(
          "Usage: meteor logs <site>\n" +
            "\n" +
            "Retrieves the server logs for the requested site.\n");
        process.exit(1);
      }

      deploy.logs(argv._[0]);
    }
  });

  Commands.push({
    name: "reset",
    help: "Reset the project state. Erases the local database.",
    func: function (argv) {
      if (argv.help) {
        process.stdout.write(
          "Usage: meteor reset\n" +
            "\n" +
            "Reset the current project to a fresh state. Removes all local\n" +
            "data and kills any running meteor development servers.\n");
        process.exit(1);
      } else if (!_.isEmpty(argv._)) {
        process.stdout.write("meteor reset only affects the locally stored database.\n\n" +
                             "To reset a deployed application use\nmeteor deploy --delete appname\n" +
                             "followed by\nmeteor deploy appname\n");
        process.exit(1);
      }

      var app_dir = path.resolve(requireDirInApp("reset"));

      find_mongo_port("reset", function (mongod_port) {
        if (mongod_port) {
          process.stdout.write(
            "reset: Meteor is running.\n" +
              "\n" +
              "This command does not work while Meteor is running your application.\n" +
              "Exit the running meteor development server.\n");
          process.exit(1);
        }

        var local_dir = path.join(app_dir, '.meteor', 'local');
        files.rm_recursive(local_dir);

        process.stdout.write("Project reset.\n");
      });
    }
  });


  var main = function() {
    var optimist = require('optimist')
          .alias("h", "help")
          .boolean("h")
          .boolean("help")
          .boolean("version")
          .boolean("debug");

    var argv = optimist.argv;

    if (argv.help) {
      argv._.splice(0, 0, "help");
      delete argv.help;
    }

    if (argv.version) {
      var updater = require(path.join(__dirname, 'updater.js'));
      var sha = updater.git_sha();

      // XXX print release version
      process.stdout.write("Engine version " + updater.ENGINE_VERSION);

      if (files.in_checkout())
        process.stdout.write(" (git checkout)");
      else if (sha)
        process.stdout.write(" (" + sha.substr(0, 10) + ")");

      process.stdout.write("\n");
      process.exit(0);
    }

    var cmd = 'run';
    if (argv._.length)
      cmd = argv._.splice(0,1)[0];

    findCommand(cmd).func(argv);
  };

  main();
}).run();
