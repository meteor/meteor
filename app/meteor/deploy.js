// URL parsing and validation
// RPC to server (endpoint, arguments)
// see if RPC requires password
// prompt for password
// send RPC with or without password as required

var crypto = require('crypto');
var tty = require('tty');
var request = require('request');
var qs = require('querystring');
var path = require('path');
var files = require(path.join(__dirname, '..', 'lib', 'files.js'));
var _ = require(path.join(__dirname, '..', 'lib', 'third', 'underscore.js'));
var keypress = require('keypress');
var child_process = require('child_process');

//
// configuration
//

var DEPLOY_HOSTNAME = process.env.DEPLOY_HOSTNAME || 'deploy.meteor.com';

if (process.env.EMACS == "t") {
  // Hack to set stdin to be blocking, reversing node's normal setting of
  // O_NONBLOCK on the evaluation of process.stdin (because Node unblocks stdio
  // when forking). This fixes execution of Mongo from within Emacs shell.
  process.stdin;
  child_process.spawn('true', [], {stdio: 'inherit'});
}

// available RPCs are: deploy (with set-password), delete, logs,
// mongo_cred.  each RPC might require a password, which we
// interactively prompt for here.

var meteor_rpc = function (rpc_name, method, site, query_params, callback) {
  var url = "https://" + DEPLOY_HOSTNAME + '/' + rpc_name + '/' + site;

  if (!_.isEmpty(query_params))
    url += '?' + qs.stringify(query_params);

  var r = request({method: method, url: url}, function (error, response, body) {
    if (error || ((response.statusCode !== 200)
                  && (response.statusCode !== 201)))
      // pass some non-falsy error back to callback
      callback(error || response.statusCode, body);
    else
      callback(null, body);
  });

  return r;
};

var deploy_app = function (url, app_dir, opt_debug, opt_tests,
                           opt_set_password) {
  var parsed_url = parse_url(url);

  // a bit contorted here to make sure we ask for the password before
  // launching the slow bundle process.

  with_password(parsed_url.hostname, function (password) {
    if (opt_set_password)
      get_new_password(function (set_password) {
        bundle_and_deploy(parsed_url.hostname, app_dir, opt_debug, opt_tests,
                          password, set_password);
      });
    else
      bundle_and_deploy(parsed_url.hostname, app_dir, opt_debug, opt_tests,
                        password);
  });
};

var bundle_and_deploy = function (site, app_dir, opt_debug, opt_tests,
                                  password, set_password) {
  var build_dir = path.join(app_dir, '.meteor', 'local', 'build_tar');
  var bundle_path = path.join(build_dir, 'bundle');
  var bundle_opts = { skip_dev_bundle: true, no_minify: !!opt_debug,
                      include_tests: opt_tests };

  process.stdout.write('Deploying to ' + site + '.  Bundling ... ');
  var bundler = require(path.join(__dirname, '..', 'lib', 'bundler.js'));
  var errors = bundler.bundle(app_dir, bundle_path, bundle_opts);
  if (errors) {
    process.stdout.write("\n\nErrors prevented deploying:\n");
    _.each(errors, function (e) {
      process.stdout.write(e + "\n");
    });
    files.rm_recursive(build_dir);
    process.exit(1);
  }

  process.stdout.write('uploading ... ');

  var opts = {};
  if (password) opts.password = password;
  if (set_password) opts.set_password = set_password;

  var tar = child_process.spawn(
    'tar', ['czf', '-', 'bundle'], {cwd: build_dir});

  var rpc = meteor_rpc('deploy', 'POST', site, opts, function (err, body) {
    if (err) {
      var errorMessage = (body || ("Connection error (" + err.message + ")"));
      process.stderr.write("\nError deploying application: " + errorMessage + "\n");
      process.exit(1);
    }

    process.stdout.write('done.\n');
    process.stdout.write('Now serving at ' + site + '\n');

    files.rm_recursive(build_dir);

    if (!site.match('meteor.com')) {
      var dns = require('dns');
      dns.resolve(site, 'CNAME', function (err, cnames) {
        if (err || cnames[0] !== 'origin.meteor.com') {
          dns.resolve(site, 'A', function (err, addresses) {
            if (err || addresses[0] !== '107.22.210.133') {
              process.stdout.write('-------------\n');
              process.stdout.write("You've deployed to a custom domain.\n");
              process.stdout.write("Please be sure to CNAME your hostname to origin.meteor.com,\n");
              process.stdout.write("or set an A record to 107.22.210.133.\n");
              process.stdout.write('-------------\n');
            }
          });
        }
      });
    }
  });

  tar.stdout.pipe(rpc);
};

var delete_app = function (url) {
  var parsed_url = parse_url(url);

  with_password(parsed_url.hostname, function (password) {
    var opts = {};
    if (password) opts.password = password;

    meteor_rpc('deploy', 'DELETE', parsed_url.hostname, opts, function (err, body) {
      if (err) {
        process.stderr.write("Error deleting application: " + body + "\n");
        process.exit(1);
      }

      process.stdout.write("Deleted.\n");
    });
  });
};

// either print the mongo credential (just_credential is true) or open
// a mongo shell.
var mongo = function (url, just_credential) {
  var parsed_url = parse_url(url);

  with_password(parsed_url.hostname, function (password) {
    var opts = {};
    if (password) opts.password = password;

    meteor_rpc('mongo', 'GET', parsed_url.hostname, opts, function (err, body) {
      if (err) {
        process.stderr.write(body + "\n");
        process.exit(1);
      }

      if (just_credential) {
        // just print the URL
        process.stdout.write(body + "\n");

      } else {
        // pause stdin so we don't try to read it while mongo is
        // running.
        process.stdin.pause();
        run_mongo_shell(body);
      }
    });
  });
};

var logs = function (url) {
  var parsed_url = parse_url(url);

  with_password(parsed_url.hostname, function (password) {
    var opts = {};
    if (password) opts.password = password;

    meteor_rpc('logs', 'GET', parsed_url.hostname, opts, function (err, body) {
      if (err) {
        process.stderr.write(body + '\n');
        process.exit(1);
      }

      process.stdout.write(body);
    });
  });
};

// accepts www.host.com, defaults domain to meteor, defaults
// protocol to http.  on bad URL, prints error and exits the process.
//
// XXX shared w/ proxy.js
var parse_url = function (url) {
  if (!url.match(':\/\/'))
    url = 'http://' + url;

  var parsed = require('url').parse(url);

  delete parsed.host; // we use hostname

  if (parsed.hostname && !parsed.hostname.match(/\./))
    parsed.hostname += '.meteor.com';

  if (!parsed.hostname) {
    process.stdout.write(
"Please specify a domain to connect to, such as www.example.com or\n" +
"http://www.example.com/\n");
    process.exit(1);
  }

  if (parsed.pathname != '/' || parsed.hash || parsed.query) {
    process.stdout.write(
"Sorry, Meteor does not yet support specific path URLs, such as\n" +
"http://www.example.com/blog .  Please specify the root of a domain.\n");
    process.exit(1);
  }

  return parsed;
};

var run_mongo_shell = function (url) {
  var mongo_path = path.join(files.get_dev_bundle(), 'mongodb', 'bin', 'mongo');
  var mongo_url = require('url').parse(url);
  var auth = mongo_url.auth && mongo_url.auth.split(':');

  var args = [];
  if (auth) args.push('-u', auth[0]);
  if (auth) args.push('-p', auth[1]);
  args.push(mongo_url.hostname + ':' + mongo_url.port + mongo_url.pathname);

  var proc = child_process.spawn(mongo_path,
                                 args,
                                 { stdio: 'inherit' });
};

// hash the password so we never send plaintext over the wire. Doesn't
// actually make us more secure, but it means we won't leak a user's
// password, which they might use on other sites too.
var transform_password = function (password) {
  var hash = crypto.createHash('sha1');
  hash.update('S3krit Salt!');
  hash.update(password);
  return hash.digest('hex');
};

// read a password from stdin. return it in a callback.
var read_password = function (callback) {
  // Password prompt code adapted from
  // https://github.com/visionmedia/commander.js/blob/master/lib/commander.js

  var buf = '';
  process.stdin.setRawMode(true);

  // keypress
  keypress(process.stdin);
  process.stdin.on('keypress', function(c, key){
    if (key && 'enter' === key.name) {
      console.log();
      process.stdin.pause();
      process.stdin.removeAllListeners('keypress');
      process.stdin.setRawMode(false);

      // if they just hit enter, prompt again. let's not do this.
      // This means empty password is a valid password.
      //if (!buf.trim().length) return self.password(str, mask, fn);

      callback(transform_password(buf));
      return;
    }

    // deal with backspace
    if (key && 'backspace' === key.name) {
      buf = buf.substring(0, buf.length - 1);
      return;
    }

    // raw mode masks control-c. make sure users can get out.
    if (key && key.ctrl && 'c' === key.name) {
      console.log();
      process.stdin.pause();
      process.stdin.removeAllListeners('keypress');
      process.stdin.setRawMode(false);

      process.kill(process.pid, 'SIGINT');
      return;
    }

    buf += c;
  });

  process.stdin.resume();
};

// Check if a particular endpoint requires a password. If so, prompt for
// it.
//
// takes an site name and callback function(password). This is always
// called exactly once. Calls callback with the entered password, or
// undefined if no password is required.
var with_password = function (site, callback) {
  var check_url = "https://" + DEPLOY_HOSTNAME + "/has_password/" + site;

  request(check_url, function (error, response, body) {
    if (error || response.statusCode !== 200) {
      callback();

    } else if (body === "false") {
      // XXX in theory we should JSON parse the result, and use
      // that. But we happen to know we'll only ever get 'true' or
      // 'false' if we got a 200, so don't bother.
      callback();

    } else {
      process.stdout.write("Password: ");
      read_password(callback);
    }
  });
};

// Prompts for a new password, asking you twice so you don't typo
// it. Keeps prompting you until you have two that match.
var get_new_password = function (callback) {
  process.stdout.write("New Password: ");
  read_password(function (p1) {
    process.stdout.write("New Password (again): ");
    read_password(function (p2) {
      if (p1 === p2) {
        callback(p1);
        return;
      }
      process.stdout.write("Passwords do not match! Try again.\n");
      get_new_password(callback);
    });
  });
};

exports.deploy_app = deploy_app;
exports.delete_app = delete_app;
exports.mongo = mongo;
exports.logs = logs;

exports.run_mongo_shell = run_mongo_shell;
