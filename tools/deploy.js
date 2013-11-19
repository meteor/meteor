// URL parsing and validation
// RPC to server (endpoint, arguments)
// see if RPC requires password
// prompt for password
// send RPC with or without password as required

var qs = require('querystring');
var path = require('path');
var files = require('./files.js');
var httpHelpers = require('./http-helpers.js');
var warehouse = require('./warehouse.js');
var buildmessage = require('./buildmessage.js');
var _ = require('underscore');
var inFiber = require('./fiber-helpers.js').inFiber;
var Future = require('fibers/future');

//
// configuration
//

var DEPLOY_HOSTNAME = process.env.DEPLOY_HOSTNAME || 'deploy.meteor.com';

if (process.env.EMACS == "t") {
  // Hack to set stdin to be blocking, reversing node's normal setting of
  // O_NONBLOCK on the evaluation of process.stdin (because Node unblocks stdio
  // when forking). This fixes execution of Mongo from within Emacs shell.
  process.stdin;
  var child_process = require('child_process');
  child_process.spawn('true', [], {stdio: 'inherit'});
}

// available RPCs are: deploy (with set-password), delete, logs,
// mongo_cred.  each RPC might require a password, which we
// interactively prompt for here.

var meteor_rpc = function (rpc_name, method, site, query_params, callback) {
  var url;
  if (DEPLOY_HOSTNAME.indexOf("http://") === 0)
    url = DEPLOY_HOSTNAME + '/' + rpc_name + '/' + site;
  else
    url = "https://" + DEPLOY_HOSTNAME + '/' + rpc_name + '/' + site;

  if (!_.isEmpty(query_params)) {
    url += '?' + qs.stringify(query_params);
  }

  var r = httpHelpers.request(
    {method: method, url: url},
    function (error, response, body) {
      if (error || ((response.statusCode !== 200)
                    && (response.statusCode !== 201)))
        // pass some non-falsy error back to callback
        callback(error || response.statusCode, body);
      else
        callback(null, body);
    });

  return r;
};

// called by command-line `meteor deploy`
var deployCmd = function (options) {
  var parsed_url = parse_url(options.url);

  // a bit contorted here to make sure we ask for the password before
  // launching the slow bundle process.
  with_password(parsed_url.hostname, function (password) {
    var deployOptions = {
      site: parsed_url.hostname,
      password: password,
      settings: options.settings
    };
    if (options.setPassword)
      get_new_password(function (newPassword) {
        deployOptions.setPassword = newPassword;
        deployToServer(options.appDir, options.bundleOptions, deployOptions);
      });
    else
      deployToServer(options.appDir, options.bundleOptions, deployOptions);
  });
};

// a utility used by `meteor deploy` and `meteor test-packages`
var deployToServer = function (app_dir, bundleOptions, deployOptions) {
  // might be parsing twice if called from deploy_app but that's fine
  var site = parse_url(deployOptions.site).hostname;

  var password = deployOptions.password;
  var set_password = deployOptions.setPassword;
  var settings = deployOptions.settings;
  var build_dir = path.join(app_dir, '.meteor', 'local', 'build_tar');
  var bundle_path = path.join(build_dir, 'bundle');

  process.stdout.write('Deploying to ' + site + '.  Bundling...\n');
  var bundler = require('./bundler.js');
  var bundleResult = bundler.bundle(app_dir, bundle_path, bundleOptions);
  if (bundleResult.errors) {
    process.stdout.write("\n\nErrors prevented deploying:\n");
    process.stdout.write(bundleResult.errors.formatMessages());
    process.exit(1);
  }

  process.stdout.write('Uploading...\n');

  var rpcOptions = {};
  if (password) rpcOptions.password = password;
  if (set_password) rpcOptions.set_password = set_password;

  // When it hits the wire, all these opts will be URL-encoded.
  if (settings !== undefined) rpcOptions.settings = settings;

  var tar = files.createTarGzStream(path.join(build_dir, 'bundle'));

  var rpc = meteor_rpc('deploy', 'POST', site, rpcOptions, function (err, body) {
    if (err) {
      var errorMessage = (body || ("Connection error (" + err.message + ")"));
      process.stderr.write("\nError deploying application: " + errorMessage + "\n");
      process.exit(1);
    }

    var hostname = null;
    var response = null;
    try {
      response = JSON.parse(body);
    } catch (e) {
      // ... leave null
    }
    if (response && response.url) {
      var url = require('url').parse(response.url);
      if (url && url.hostname)
        hostname = url.hostname;
    }

    if (!hostname) {
      process.stdout.write('Error receiving hostname from deploy server.\n');
      process.exit(1);
    }

    process.stdout.write('Now serving at ' + hostname + '\n');
    files.rm_recursive(build_dir);


    if (hostname && !hostname.match(/meteor\.com$/)) {
      var dns = require('dns');
      dns.resolve(hostname, 'CNAME', function (err, cnames) {
        if (err || cnames[0] !== 'origin.meteor.com') {
          dns.resolve(hostname, 'A', function (err, addresses) {
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

  tar.pipe(rpc);
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

var temporaryMongoUrl = function (url) {
  var parsed_url = parse_url(url);
  var passwordFut = new Future();
  with_password(parsed_url.hostname, function (password) {
    passwordFut.return(password);
  });
  var password = passwordFut.wait();
  var urlFut = new Future();
  var opts = {};
  if (password)
    opts.password = password;
  meteor_rpc('mongo', 'GET',
             parsed_url.hostname, opts, function (err, body) {
               if (err) {
                 process.stderr.write(body + "\n");
                 process.exit(1);
               }
               urlFut.return(body);
             });
  var mongoUrl = urlFut.wait();
  return mongoUrl;
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
  var ssl = require('querystring').parse(mongo_url.query).ssl === "true";

  var args = [];
  if (ssl) args.push('--ssl');
  if (auth) args.push('-u', auth[0]);
  if (auth) args.push('-p', auth[1]);
  args.push(mongo_url.hostname + ':' + mongo_url.port + mongo_url.pathname);

  var child_process = require('child_process');
  var proc = child_process.spawn(mongo_path,
                                 args,
                                 { stdio: 'inherit' });
};

// hash the password so we never send plaintext over the wire. Doesn't
// actually make us more secure, but it means we won't leak a user's
// password, which they might use on other sites too.
var transform_password = function (password) {
  var crypto = require('crypto');
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
  if (process.stdin.setRawMode) {
    // when piping password from bash to meteor we have no setRawMode() available
    process.stdin.setRawMode(true);
  }

  // keypress
  var keypress = require('keypress');
  keypress(process.stdin);
  process.stdin.on('keypress', inFiber(function(c, key){
    if (key && (key.name === 'enter' || key.name === 'return')) {
      console.log();
      process.stdin.pause();
      process.stdin.removeAllListeners('keypress');
      if (process.stdin.setRawMode) {
        // when piping password from bash to meteor we have no setRawMode() available
        process.stdin.setRawMode(false);
      }

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
  }));

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

  // XXX we've been using `inFiber` as needed, but I wish we'd instead
  // always have callbacks that do nothing other than Future.ret or
  // Future.throw. Basically, what Future.wrap does.
  callback = inFiber(callback);

  httpHelpers.request(check_url, function (error, response, body) {
    if (error || response.statusCode !== 200) {
      callback();

    } else if (body === "false") {
      // XXX in theory we should JSON parse the result, and use
      // that. But we happen to know we'll only ever get 'true' or
      // 'false' if we got a 200, so don't bother.
      callback();

    } else {
      process.stderr.write("Password: ");
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

exports.deployCmd = deployCmd;
exports.deployToServer = deployToServer;
exports.delete_app = delete_app;
exports.temporaryMongoUrl = temporaryMongoUrl;
exports.logs = logs;

exports.run_mongo_shell = run_mongo_shell;
