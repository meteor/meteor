var files = require('../lib/files.js');
var path = require('path');
var _ = require('../lib/third/underscore.js');

var usage = function() {
  process.stdout.write(
"Usage: skybreak [--version] [--help] <command> [<args>]\n" +
"\n" +
"With no arguments, 'skybreak' runs the project in the current\n" +
"directory in local development mode. You can run it from the root\n" +
"directory of the project or from any subdirectory.\n" +
"\n" +
"Use 'skybreak create <name>' to create a new Skybreak project.\n" +
"\n" +
"Commands:\n");
  Commands.forEach(function (cmd) {
    if (cmd.help) {
      var name = cmd.name + "           ".substr(cmd.name.length);
      process.stdout.write("   " + name + cmd.help + "\n");
    }
  });
  process.stdout.write("\n");
process.stdout.write(
"See 'skybreak help <command>' for details on a command.\n");
  process.exit(1);
};

var require_project = function (cmd) {
  var app_dir = files.find_app_dir();
  if (!app_dir) {
    // This is where you end up if you type 'skybreak' with no
    // args. Be gentle to the noobs..
    process.stdout.write(
cmd + ": You're not in a Skybreak project directory.\n" +
"\n" +
"To create a new Skybreak project:\n" +
"   skybreak create <project name>\n" +
"For example:\n" +
"   skybreak create myapp\n" +
"\n" +
"For more help, see 'skybreak --help'.\n");
    process.exit(1);
  }
  return app_dir;
};

// See if mongo is running already. If so, return the current port. If
// not, return null.
var find_mongo_port = function (cmd) {
  var app_dir = require_project(cmd);

  var fs = require("fs");
  var pid_path = path.join(app_dir, '.skybreak/local/mongod.pid');
  var port_path = path.join(app_dir, '.skybreak/local/mongod.port');
  var port;

  try {
    var pid_data = parseInt(fs.readFileSync(pid_path));
    process.kill(pid_data, 0); // make sure it is still alive
    port = parseInt(fs.readFileSync(port_path));
  } catch (e) {
    return null;
  }

  return port;
};

Commands = [];

var findCommand = function (name) {
  for (var i = 0; i < Commands.length; i++)
    if (Commands[i].name === name)
      return Commands[i];
  process.stdout.write("'" + name + "' is not a Skybreak command. See " +
                       "'skybreak --help'.\n");
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
      .usage(
"Usage: skybreak run [options]\n" +
"\n" +
"Searches upward from the current directory for the root directory of a\n" +
"Skybreak project, then runs that project in local development\n" +
"mode. You can use the application by pointing your web browser at\n" +
"localhost:3000. No internet connection is required.\n" +
"\n" +
"Whenever you change any of the application's source files, the changes\n" +
"are automatically detected and applied to the running application.\n" +
"\n" +
"The application's database persists between runs. It's stored under\n" +
"the .skybreak directory in the root of the project.\n"
);

    new_argv = opt.argv;

    if (argv.help) {
      process.stdout.write(opt.help());
      process.exit(1);
    }

    var app_dir = require_project("run");
    var bundle_path = path.join(app_dir, '.skybreak/local/build');
    var bundle_opts = { no_minify: !new_argv.production, symlink_dev_bundle: true };
    require('./run.js').run(app_dir, bundle_path, bundle_opts, new_argv.port);
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
    if (argv.help || argv._.length !== 1 || !argv._[0].length) {
      process.stdout.write(
"Usage: skybreak create <name>\n" +
"\n" +
"Make a subdirectory named <name> and create a new Skybreak project\n" +
"there. You can also pass an absolute or relative path.\n");
      process.exit(1);
    }

    var name = argv._[0];
    if (path.existsSync(name)) {
      process.stderr.write(name + ": Already exists\n");
      process.exit(1);
    }

    if (files.find_app_dir(name)) {
      process.stderr.write(
"You can't create a Skybreak project inside another Skybreak project.\n");
      process.exit(1);
    }

    var transform = function (x) {
      return x.replace(/~name~/g, path.basename(name));
    };
    files.cp_r(path.join(__dirname, 'skel'), name, {
      transform_filename: function (f) {
        return transform(f);
      },
      transform_contents: function (contents, f) {
        if (f.substr(-5) === ".html") {
          return new Buffer(transform(contents.toString()));
        } else {
          return contents;
        }
      }
    });
  }
});

Commands.push({
  name: "update",
  help: "Upgrade to the latest version of Skybreak",
  func: function (argv) {
    if (argv.help) {
      process.stdout.write(
"Usage: skybreak update\n" +
"\n" +
"Checks to see if a new version of Skybreak is available, and if so,\n" +
"downloads and installs it. You must be connected to the internet.\n");
      process.exit(1);
    }

    require('./update.js');
  }
});

Commands.push({
  name: "add",
  help: "Add a package to this project",
  func: function (argv) {
    if (argv.help || !argv._.length) {
      process.stdout.write(
"Usage: skybreak add <package> [package] [package..]\n" +
"\n" +
"Adds packages to your Skybreak project. You can add multiple\n" +
"packages with one command. For a list of the available packages, see\n" +
"'skybreak list'.\n");
      process.exit(1);
    }

    var app_dir = require_project('add');
    var packages = require('../lib/packages.js');
    var project = require('../lib/project.js');
    var all = packages.list();
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
        var note = all[name].summary || '';
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
"Usage: skybreak remove <package> [package] [package..]\n" +
"\n" +
"Removes a package previously added to your Skybreak project. For a\n" +
"list of the packages that your application is currently using, see\n" +
"'skybreak list --using'.\n");
      process.exit(1);
    }

    var app_dir = require_project('remove');
    var packages = require('../lib/packages.js');
    var project = require('../lib/project.js');
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
"Usage: skybreak list [--using]\n" +
"\n" +
"Without arguments, lists all available Skybreak packages. To add one\n" +
"of these packages to your project, see 'skybreak add'.\n" +
"\n" +
"With --using, list the packages that you have added to your project.\n");
      process.exit(1);
    }

    if (argv.using) {
      var app_dir = require_project('list --using');
      var using = require('../lib/project.js').get_packages(app_dir);

      if (using.length) {
        _.each(using, function (name) {
          process.stdout.write(name + "\n");
        });
      } else {
        process.stderr.write(
"This project doesn't use any packages yet. To add some packages:\n" +
"  skybreak add <package> <package> ...\n" +
"\n" +
"To see available packages:\n" +
"  skybreak packages\n");
      }
      return;
    }

    var list = require('../lib/packages.js').list();
    var names = _.keys(list);
    names.sort();
    var descrs = [];
    _.each(names, function (name) {
      descrs.push(list[name]);
    });
    process.stdout.write("\n" +
                         require('../lib/packages.js').format_list(descrs) +
                         "\n");
  }
});

Commands.push({
  name: "bundle",
  help: "Pack this project up into a tarball",
  func: function (argv) {
    if (argv.help || argv._.length != 1) {
      process.stdout.write(
"Usage: skybreak bundle <output_file.tar.gz>\n" +
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

    var app_dir = path.resolve(require_project("bundle"));
    var build_dir = path.join(app_dir, '.skybreak/local/build_tar');
    var bundle_path = path.join(build_dir, 'bundle');
    var output_path = path.resolve(argv._[0]); // get absolute path
    require('../lib/bundler.js').bundle(app_dir, bundle_path);

    var cp = require('child_process');
    cp.execFile('/usr/bin/env',
                ['tar', 'czf', output_path, 'bundle'],
                {cwd: build_dir},
                function (error, stdout, stderr) {
                  if (error !== null) {
                    console.log(JSON.stringify(error));
                    process.stderr.write("couldn't run tar\n");
                  } else {
                    process.stdout.write(stdout);
                    process.stderr.write(stderr);
                  }
                  files.rm_recursive(build_dir);
                });
  }
});

Commands.push({
  name: "deploy",
  help: "Deploy this project to Skybreak",
  func: function (argv) {
    if (argv.help || argv._.length < 1 || argv._.length > 2) {
      process.stdout.write(
"Usage: skybreak deploy <site>\n" +
"\n" +
"Deploy the current code in your tree to the specified subdomain of\n" +
"skybreakplatform.com.\n");
      process.exit(1);
    }

    var deploy = require('./deploy');

    var url = deploy.parse_url(argv._[0]);

    if (!url.hostname) {
      process.stdout.write(
"Please specify a domain to deploy to, such as www.example.com or\n" +
"http://www.example.com/\n");
      process.exit(1);
    }

    if (url.pathname != '/' || url.hash || url.query) {
      process.stdout.write(
"Sorry, Skybreak does not yet support deploying to a specific path URL, such as\n" +
"http://www.example.com/blog .  Please specify the root of a domain.\n");
      process.exit(1);
    }

    process.stdout.write('Deploying to ' + url.hostname + '.  Bundling ... ');

    var app_dir = path.resolve(require_project("bundle"));
    var build_dir = path.join(app_dir, '.skybreak/local/build_tar');
    var bundle_path = path.join(build_dir, 'bundle');
    var bundle_opts = { skip_dev_bundle: true };
    require('../lib/bundler.js').bundle(app_dir, bundle_path, bundle_opts);

    process.stdout.write('uploading ... ');

    var spawn = require('child_process').spawn;

    var tar = spawn('tar', ['czf', '-', 'bundle'], {cwd: build_dir});

    var deploy_req_opts = {
      method: 'POST',
      host: 'deploy.skybreakplatform.com',
      path: '/deploy/' + url.hostname
    };

    var http = require('http');
    var deploy_req = http.request(deploy_req_opts, function (deploy_res) {
      deploy_res.on('end', function () {
        process.stdout.write('done.\n');
        process.stdout.write('Now serving at ' + url.hostname + '\n');

        files.rm_recursive(build_dir);

        if (!url.hostname.match('skybreakplatform.com')) {
          var dns = require('dns');
          dns.resolve(url.hostname, 'CNAME', function (err, cnames) {
            if (err || cnames[0] !== 'origin.skybreakplatform.com') {
              dns.resolve(url.hostname, 'A', function (err, addresses) {
                if (err || addresses[0] !== '107.22.210.133') {
                  process.stdout.write('-------------\n');
                  process.stdout.write("You've deployed to a custom domain.\n");
                  process.stdout.write("Please be sure to CNAME your hostname to origin.skybreakplatform.com,\n");
                  process.stdout.write("or set an A record to 107.22.210.133.\n");
                  process.stdout.write('-------------\n');
                }
              });
            }
          });
        }
      });
    });

    tar.stdout.on('data', function (data) {
      deploy_req.write(data);
    });

    tar.on('exit', function (code) {
      deploy_req.end();
    });
  }
});

Commands.push({
  name: "logs",
  help: "Show logs for specified site",
  func: function (argv) {
    if (argv.help || argv._.length < 1 || argv._.length > 2) {
      process.stdout.write(
"Usage: skybreak logs <site>\n" +
"\n" +
"Retrieves the logs for the requested site.\n");
      process.exit(1);
    }

    var deploy = require('./deploy');
    var url = deploy.parse_url(argv._[0]);

    var http = require('http');

    var options = {
      host: 'deploy.skybreakplatform.com',
      port: 80,
      path: '/logs/' + url.hostname,
    };

    var req = http.get(options, function(res) {
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        process.stdout.write(chunk);
      });
    });

    req.on('error', function(e) {
      console.log("Error connecting to Skybreak: " + e.message);
      process.exit(1);
    });
  }
});

Commands.push({
  name: "mongo",
  help: "Open a MongoDB shell on this project's local database",
  func: function (argv) {
    if (argv.help) {
      process.stdout.write(
"Usage: skybreak mongo\n" +
"\n" +
"Open a MongoDB shell on your local development database, so that you\n" +
"can view or manipulate it directly. You must already have your\n" +
"application running locally.\n");
      process.exit(1);
    }

    var mongod_port = find_mongo_port("mongo");

    if (!mongod_port) {
      process.stdout.write(
"mongo: Skybreak isn't running.\n" +
"\n" +
"This command only works while Skybreak is running your application\n" +
"locally. Start your application first.\n");
      process.exit(1);
    }

    var path_base = path.join(path.dirname(process.execPath), '..');
    var mongo_path = path.join(path_base, 'mongodb/bin/mongo');

    process.stdout.write("Database: " +
                         files.pretty_path(files.find_app_dir()) +
                         "/.skybreak\n\n");

    var spawn = require('child_process').spawn;
    var mongo_proc = spawn(mongo_path,[
      '127.0.0.1:' +  mongod_port + '/skybreak', '--shell'
    ], {
      customFds: [0, 1, 2], // just take the fds! sketch, but works
    });
  }
});

Commands.push({
  name: "reset",
  help: "Reset the project state. Erases the local database.",
  func: function (argv) {
    if (argv.help) {
      process.stdout.write(
"Usage: skybreak reset\n" +
"\n" +
"Reset the current project to a fresh state. Removes all local\n" +
"data and kills any running skybreak development servers.\n");
      process.exit(1);
    }

    var app_dir = path.resolve(require_project("reset"));

    var mongod_port = find_mongo_port("reset");
    if (mongod_port) {
      process.stdout.write(
"reset: Skybreak is running.\n" +
"\n" +
"This command does not work while Skybreak is running your application.\n" +
"Exit the running skybreak development server.\n");
      process.exit(1);
    }

    var local_dir = path.join(app_dir, '.skybreak/local');
    files.rm_recursive(local_dir);

    process.stdout.write("Project reset.\n");
  }
});


var main = function() {
  var optimist = require('optimist')
    .boolean("h").alias("h", "help")
    .boolean("version")
    .boolean("debug");

  var argv = optimist.argv;

  if (argv.help) {
    argv._.splice(0, 0, "help");
    delete argv.help;
  }

  if (argv.version) {
    var updater = require('../lib/updater.js');
    process.stdout.write("Skybreak version " + updater.CURRENT_VERSION + "\n");
    process.exit(0);
  }

  var cmd = 'run';
  if (argv._.length)
    cmd = argv._.splice(0,1)[0];

  findCommand(cmd).func(argv);
};

main();

