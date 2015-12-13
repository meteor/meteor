// URL parsing and validation
// RPC to server (endpoint, arguments)
// see if RPC requires password
// prompt for password
// send RPC with or without password as required

var files = require('../fs/files.js');
var httpHelpers = require('../utils/http-helpers.js');
var buildmessage = require('../utils/buildmessage.js');
var config = require('./config.js');
var auth = require('./auth.js');
var _ = require('underscore');
var stats = require('./stats.js');
var Console = require('../console/console.js').Console;

// Make a synchronous RPC to the "classic" MDG deploy API. The deploy
// API has the following contract:
//
// - Parameters are always sent in the query string.
// - A tarball can be sent in the body (when deploying an app).
// - On success, all calls return HTTP 200. Those that return a value
//   either return a JSON payload or a plaintext payload and the
//   Content-Type header is set appropriately.
// - On failure, calls return some non-200 HTTP status code and
//   provide a human-readable error message in the body.
// - URLs are of the form "/[operation]/[site]".
// - Body encodings are always utf8.
// - Meteor Accounts auth is possible using first-party MDG cookies
//   (rather than OAuth).
//
// Options include:
// - method: GET, POST, or DELETE. default GET
// - operation: "info", "logs", "mongo", "deploy", "authorized-apps"
// - site: site name
// - expectPayload: an array of key names. if present, then we expect
//   the server to return JSON content on success and to return an
//   object with all of these key names.
// - expectMessage: if true, then we expect the server to return text
//   content on success.
// - bodyStream: if provided, a stream to use as the request body
// - any other parameters accepted by the node 'request' module, for example
//   'qs' to set query string parameters
//
// Waits until server responds, then returns an object with the
// following keys:
//
// - statusCode: HTTP status code, or null if the server couldn't be
//   contacted
// - payload: if successful, and the server returned a JSON body, the
//   parsed JSON body
// - message: if successful, and the server returned a text body, the
//   body as a string
// - errorMessage: if unsuccessful, a human-readable error message,
//   derived from either a transport-level exception, the response
//   body, or a generic 'try again later' message, as appropriate

var deployRpc = function (options) {
  var genericError = "Server error (please try again later)";

  options = _.clone(options);
  options.headers = _.clone(options.headers || {});
  if (options.headers.cookie) {
    throw new Error("sorry, can't combine cookie headers yet");
  }

  // XXX: Reintroduce progress for upload
  try {
    var result = httpHelpers.request(_.extend(options, {
      url: config.getDeployUrl() + '/' + options.operation +
        (options.site ? ('/' + options.site) : ''),
      method: options.method || 'GET',
      bodyStream: options.bodyStream,
      useAuthHeader: true,
      encoding: 'utf8' // Hack, but good enough for the deploy server..
    }));
  } catch (e) {
    return {
      statusCode: null,
      errorMessage: "Connection error (" + e.message + ")"
    };
  }

  var response = result.response;
  var body = result.body;
  var ret = { statusCode: response.statusCode };

  if (response.statusCode !== 200) {
    ret.errorMessage = body.length > 0 ? body : genericError;
    return ret;
  }

  var contentType = response.headers["content-type"] || '';
  if (contentType === "application/json; charset=utf-8") {
    try {
      ret.payload = JSON.parse(body);
    } catch (e) {
      ret.errorMessage = genericError;
      return ret;
    }
  } else if (contentType === "text/plain; charset=utf-8") {
    ret.message = body;
  }

  var hasAllExpectedKeys = _.all(_.map(
    options.expectPayload || [], function (key) {
      return ret.payload && _.has(ret.payload, key);
    }));

  if ((options.expectPayload && ! _.has(ret, 'payload')) ||
      (options.expectMessage && ! _.has(ret, 'message')) ||
      ! hasAllExpectedKeys) {
    delete ret.payload;
    delete ret.message;

    ret.errorMessage = genericError;
  }

  return ret;
};

// Just like deployRpc, but also presents authentication. It will
// prompt the user for a password, or use a Meteor Accounts
// credential, as necessary.
//
// Additional options (beyond deployRpc):
//
// - preflight: if true, do everything but the actual RPC. The only
//   other necessary option is 'site'. On failure, returns an object
//   with errorMessage (just like deployRpc). On success, returns an
//   object without an errorMessage key and with possible keys
//   'protection' (value either 'password' or 'account') and
//   'authorized' (true if the current user is an authorized user on
//   this app).
// - promptIfAuthFails: if true, then we think we are logged in with the
//   accounts server but our authentication actually fails, then prompt
//   the user to log in with a username and password and then resend the
//   RPC.
var authedRpc = function (options) {
  var rpcOptions = _.clone(options);
  var preflight = rpcOptions.preflight;
  delete rpcOptions.preflight;

  // Fetch auth info
  var infoResult = deployRpc({
    operation: 'info',
    site: rpcOptions.site,
    expectPayload: []
  });

  if (infoResult.statusCode === 401 && rpcOptions.promptIfAuthFails) {
    // Our authentication didn't validate, so prompt the user to log in
    // again, and resend the RPC if the login succeeds.
    var username = Console.readLine({
      prompt: "Username: ",
      stream: process.stderr
    });
    var loginOptions = {
      username: username,
      suppressErrorMessage: true
    };
    if (auth.doInteractivePasswordLogin(loginOptions)) {
      return authedRpc(options);
    } else {
      return {
        statusCode: 403,
        errorMessage: "login failed."
      };
    }
  }

  if (infoResult.statusCode === 404) {
    // Doesn't exist, therefore not protected.
    return preflight ? { } : deployRpc(rpcOptions);
  }

  if (infoResult.errorMessage) {
    return infoResult;
  }
  var info = infoResult.payload;

  if (! _.has(info, 'protection')) {
    // Not protected.
    //
    // XXX should prompt the user to claim the app (only if deploying?)
    return preflight ? { } : deployRpc(rpcOptions);
  }

  if (info.protection === "password") {
    if (preflight) {
      return { protection: info.protection };
    }
    // Password protected. Read a password, hash it, and include the
    // hashed password as a query parameter when doing the RPC.
    var password;
    password = Console.readLine({
      echo: false,
      prompt: "Password: ",
      stream: process.stderr
    });

    // Hash the password so we never send plaintext over the
    // wire. Doesn't actually make us more secure, but it means we
    // won't leak a user's password, which they might use on other
    // sites too.
    var crypto = require('crypto');
    var hash = crypto.createHash('sha1');
    hash.update('S3krit Salt!');
    hash.update(password);
    password = hash.digest('hex');

    rpcOptions = _.clone(rpcOptions);
    rpcOptions.qs = _.clone(rpcOptions.qs || {});
    rpcOptions.qs.password = password;

    return deployRpc(rpcOptions);
  }

  if (info.protection === "account") {
    if (! _.has(info, 'authorized')) {
      // Absence of this implies that we are not an authorized user on
      // this app
      if (preflight) {
        return { protection: info.protection };
      } else {
        return {
          statusCode: null,
          errorMessage: auth.isLoggedIn() ?
            // XXX better error message (probably need to break out of
            // the 'errorMessage printed with brief prefix' pattern)
            "Not an authorized user on this site" :
            "Not logged in"
        };
      }
    }

    // Sweet, we're an authorized user.
    if (preflight) {
      return {
        protection: info.protection,
        authorized: info.authorized
      };
    } else {
      return deployRpc(rpcOptions);
    }
  }

  return {
    statusCode: null,
    errorMessage: "You need a newer version of Meteor to work with this site"
  };
};

// When the user is trying to do something with a legacy
// password-protected app, instruct them to claim it with 'meteor
// claim'.
var printLegacyPasswordMessage = function (site) {
  Console.error(
    "\nThis site was deployed with an old version of Meteor that used " +
    "site passwords instead of user accounts. Now we have a much better " +
    "system, Meteor developer accounts.");
  Console.error();
  Console.error("If this is your site, please claim it into your account with");
  Console.error(
    Console.command("meteor claim " + site),
    Console.options({ indent: 2 }));
};

// When the user is trying to do something with an app that they are not
// authorized for, instruct them to get added via 'meteor authorized
// --add' or switch accounts.
var printUnauthorizedMessage = function () {
  var username = auth.loggedInUsername();
  Console.error("Sorry, that site belongs to a different user.");
  if (username) {
    Console.error("You are currently logged in as " + username + ".");
  }
  Console.error();
  Console.error(
    "Either have the site owner use " +
    Console.command("'meteor authorized --add'") + " to add you as an " +
    "authorized developer for the site, or switch to an authorized account " +
    "with " + Console.command("'meteor login'") + ".");
};

// Take a proposed sitename for deploying to. If it looks
// syntactically good, canonicalize it (this essentially means
// stripping 'http://' or a trailing '/' if present) and return it. If
// not, print an error message to stderr and return null.
var canonicalizeSite = function (site) {
  // There are actually two different bugs here. One is that the meteor deploy
  // server does not support apps whose total site length is greater than 63
  // (because of how it generates Mongo database names); that can be fixed on
  // the server. After that, this check will be too strong, but we still will
  // want to check that each *component* of the hostname is at most 63
  // characters (url.parse will do something very strange if a component is
  // larger than 63, which is the maximum legal length).
  if (site.length > 63) {
    Console.error(
      "The maximum hostname length currently supported is 63 characters: " +
      site + " is too long. " +
      "Please try again with a shorter URL for your site.");
    return false;
  }

  var url = site;
  if (!url.match(':\/\/')) {
    url = 'http://' + url;
  }

  var parsed = require('url').parse(url);

  if (! parsed.hostname) {
    Console.info(
      "Please specify a domain to connect to, such as www.example.com or " +
      "http://www.example.com/");
    return false;
  }

  if (parsed.pathname != '/' || parsed.hash || parsed.query) {
    Console.info(
      "Sorry, Meteor does not yet support specific path URLs, such as " +
      Console.url("http://www.example.com/blog") + " .  Please specify the root of a domain.");
    return false;
  }

  return parsed.hostname;
};

// Run the bundler and deploy the result. Print progress
// messages. Return a command exit code.
//
// Options:
// - projectContext: the ProjectContext for the app
// - site: site to deploy as
// - settingsFile: file from which to read deploy settings (undefined
//   to leave unchanged from previous deploy of the app, if any)
// - recordPackageUsage: (defaults to true) if set to false, don't
//   send information about packages used by this app to the package
//   stats server.
// - buildOptions: the 'buildOptions' argument to the bundler
var bundleAndDeploy = function (options) {
  if (options.recordPackageUsage === undefined) {
    options.recordPackageUsage = true;
  }

  var site = canonicalizeSite(options.site);
  if (! site) {
    return 1;
  }

  // We should give a username/password prompt if the user was logged in
  // but the credentials are expired, unless the user is logged in but
  // doesn't have a username (in which case they should hit the email
  // prompt -- a user without a username shouldn't be given a username
  // prompt). There's an edge case where things happen in the following
  // order: user creates account, user sets username, credential expires
  // or is revoked, user comes back to deploy again. In that case,
  // they'll get an email prompt instead of a username prompt because
  // the command-line tool didn't have time to learn about their
  // username before the credential was expired.
  auth.pollForRegistrationCompletion({
    noLogout: true
  });
  var promptIfAuthFails = (auth.loggedInUsername() !== null);

  // Check auth up front, rather than after the (potentially lengthy)
  // bundling process.
  var preflight = authedRpc({
    site: site,
    preflight: true,
    promptIfAuthFails: promptIfAuthFails
  });

  if (preflight.errorMessage) {
    Console.error("Error deploying application: " + preflight.errorMessage);
    return 1;
  }

  if (preflight.protection === "password") {
    printLegacyPasswordMessage(site);
    Console.error("If it's not your site, please try a different name!");
    return 1;

  } else if (preflight.protection === "account" &&
             ! preflight.authorized) {
    printUnauthorizedMessage();
    return 1;
  }

  var buildDir = files.mkdtemp('build_tar');
  var bundlePath = files.pathJoin(buildDir, 'bundle');

  Console.info('Deploying to ' + site + '.');

  var settings = null;
  var messages = buildmessage.capture({
    title: "preparing to deploy",
    rootPath: process.cwd()
  }, function () {
    if (options.settingsFile) {
      settings = files.getSettings(options.settingsFile);
    }
  });

  if (! messages.hasMessages()) {
    var bundler = require('../isobuild/bundler.js');

    var bundleResult = bundler.bundle({
      projectContext: options.projectContext,
      outputPath: bundlePath,
      buildOptions: options.buildOptions,
      providePackageJSONForUnavailableBinaryDeps: !!process.env.METEOR_BINARY_DEP_WORKAROUND,
    });

    if (bundleResult.errors) {
      messages = bundleResult.errors;
    }
  }

  if (messages.hasMessages()) {
    Console.info("\nErrors prevented deploying:");
    Console.info(messages.formatMessages());
    return 1;
  }

  if (options.recordPackageUsage) {
    stats.recordPackages({
      what: "sdk.deploy",
      projectContext: options.projectContext,
      site: site
    });
  }

  var result = buildmessage.enterJob({ title: "uploading" }, function () {
    return authedRpc({
      method: 'POST',
      operation: 'deploy',
      site: site,
      qs: settings !== null ? {settings: settings} : {},
      bodyStream: files.createTarGzStream(files.pathJoin(buildDir, 'bundle')),
      expectPayload: ['url'],
      preflightPassword: preflight.preflightPassword
    });
  });


  if (result.errorMessage) {
    Console.error("\nError deploying application: " + result.errorMessage);
    return 1;
  }

  var deployedAt = require('url').parse(result.payload.url);
  var hostname = deployedAt.hostname;

  Console.info('Now serving at http://' + hostname);

  if (! hostname.match(/meteor\.com$/)) {
    var dns = require('dns');
    dns.resolve(hostname, 'CNAME', function (err, cnames) {
      if (err || cnames[0] !== 'origin.meteor.com') {
        dns.resolve(hostname, 'A', function (err, addresses) {
          if (err || addresses[0] !== '107.22.210.133') {
            Console.info('-------------');
            Console.info(
              "You've deployed to a custom domain.",
              "Please be sure to CNAME your hostname",
              "to origin.meteor.com, or set an A record to 107.22.210.133.");
            Console.info('-------------');
          }
        });
      }
    });
  }

  return 0;
};

var deleteApp = function (site) {
  site = canonicalizeSite(site);
  if (! site) {
    return 1;
  }

  var result = authedRpc({
    method: 'DELETE',
    operation: 'deploy',
    site: site,
    promptIfAuthFails: true
  });

  if (result.errorMessage) {
    Console.error("Couldn't delete application: " + result.errorMessage);
    return 1;
  }

  Console.info("Deleted.");
  return 0;
};

// Helper that does a preflight request to check auth, and prints the
// appropriate error message if auth fails or if this is a legacy
// password-protected app. If auth succeeds, then it runs the actual
// RPC. 'site' and 'operation' are the site and operation for the
// RPC. 'what' is a string describing the operation, for use in error
// messages.  Returns the result of the RPC if successful, or null
// otherwise (including if auth failed or if the user is not authorized
// for this site).
var checkAuthThenSendRpc = function (site, operation, what) {
  var preflight = authedRpc({
    operation: operation,
    site: site,
    preflight: true,
    promptIfAuthFails: true
  });

  if (preflight.errorMessage) {
    Console.error("Couldn't " + what + ": " + preflight.errorMessage);
    return null;
  }

  if (preflight.protection === "password") {
    printLegacyPasswordMessage(site);
    return null;
  } else if (preflight.protection === "account" &&
             ! preflight.authorized) {
    if (! auth.isLoggedIn()) {
      // Maybe the user is authorized for this app but not logged in
      // yet, so give them a login prompt.
      var loginResult = auth.doUsernamePasswordLogin({ retry: true });
      if (loginResult) {
        // Once we've logged in, retry the whole operation. We need to
        // do the preflight request again instead of immediately moving
        // on to the real RPC because we don't yet know if the newly
        // logged-in user is authorized for this app, and if they
        // aren't, then we want to print the nice unauthorized error
        // message.
        return checkAuthThenSendRpc(site, operation, what);
      } else {
        // Shouldn't ever get here because we set the retry flag on the
        // login, but just in case.
        Console.error(
          "\nYou must be logged in to " + what + " for this app. Use " +
           Console.command("'meteor login'") + "to log in.");
        Console.error();
        Console.error(
          "If you don't have a Meteor developer account yet, you can quickly " +
          "create one at www.meteor.com.");
        return null;
      }
    } else { // User is logged in but not authorized for this app
      Console.error();
      printUnauthorizedMessage();
      return null;
    }
  }

  // User is authorized for the app; go ahead and do the actual RPC.

  var result = authedRpc({
    operation: operation,
    site: site,
    expectMessage: true,
    promptIfAuthFails: true
  });

  if (result.errorMessage) {
    Console.error("Couldn't " + what + ": " + result.errorMessage);
    return null;
  }

  return result;
};

// On failure, prints a message to stderr and returns null. Otherwise,
// returns a temporary authenticated Mongo URL allowing access to this
// site's database.
var temporaryMongoUrl = function (site) {
  site = canonicalizeSite(site);
  if (! site) {
    // canonicalizeSite printed an error
    return null;
  }

  var result = checkAuthThenSendRpc(site, 'mongo', 'open a mongo connection');

  if (result !== null) {
    return result.message;
  } else {
    return null;
  }
};

var logs = function (site) {
  site = canonicalizeSite(site);
  if (! site) {
    return 1;
  }

  var result = checkAuthThenSendRpc(site, 'logs', 'view logs');

  if (result === null) {
    return 1;
  } else {
    Console.info(result.message);
    auth.maybePrintRegistrationLink({ leadingNewline: true });
    return 0;
  }
};

var listAuthorized = function (site) {
  site = canonicalizeSite(site);
  if (! site) {
    return 1;
  }

  var result = deployRpc({
    operation: 'info',
    site: site,
    expectPayload: []
  });
  if (result.errorMessage) {
    Console.error("Couldn't get authorized users list: " + result.errorMessage);
    return 1;
  }
  var info = result.payload;

  if (! _.has(info, 'protection')) {
    Console.info("<anyone>");
    return 0;
  }

  if (info.protection === "password") {
    Console.info("<password>");
    return 0;
  }

  if (info.protection === "account") {
    if (! _.has(info, 'authorized')) {
      Console.error("Couldn't get authorized users list: " +
                    "You are not authorized");
      return 1;
    }

    Console.info((auth.loggedInUsername() || "<you>"));
    _.each(info.authorized, function (username) {
      if (username) {
        // Current username rules don't let you register anything that we might
        // want to split over multiple lines (ex: containing a space), but we
        // don't want confusion if we ever change some implementation detail.
        Console.rawInfo(username + "\n");
      }
    });
    return 0;
  }
};

// action is "add" or "remove"
var changeAuthorized = function (site, action, username) {
  site = canonicalizeSite(site);
  if (! site) {
    // canonicalizeSite will have already printed an error
    return 1;
  }

  var result = authedRpc({
    method: 'POST',
    operation: 'authorized',
    site: site,
    qs: action === "add" ? { add: username } : { remove: username },
    promptIfAuthFails: true
  });

  if (result.errorMessage) {
    Console.error("Couldn't change authorized users: " + result.errorMessage);
    return 1;
  }

  Console.info(site + ": " +
               (action === "add" ? "added " : "removed ")
                + username);
  return 0;
};

var claim = function (site) {
  site = canonicalizeSite(site);
  if (! site) {
    // canonicalizeSite will have already printed an error
    return 1;
  }

  // Check to see if it's even a claimable site, so that we can print
  // a more appropriate message than we'd get if we called authedRpc
  // straight away (at a cost of an extra REST call)
  var infoResult = deployRpc({
    operation: 'info',
    site: site
  });
  if (infoResult.statusCode === 404) {
    Console.error(
      "There isn't a site deployed at that address. Use " +
      Console.command("'meteor deploy'") + " " +
      "if you'd like to deploy your app here.");
    return 1;
  }

  if (infoResult.payload && infoResult.payload.protection === "account") {
    if (infoResult.payload.authorized) {
      Console.error("That site already belongs to you.\n");
    } else {
      Console.error("Sorry, that site belongs to someone else.\n");
    }
    return 1;
  }

  if (infoResult.payload &&
      infoResult.payload.protection === "password") {
    Console.info(
      "To claim this site and transfer it to your account, enter the",
      "site password one last time.");
    Console.info();
  }

  var result = authedRpc({
    method: 'POST',
    operation: 'claim',
    site: site,
    promptIfAuthFails: true
  });

  if (result.errorMessage) {
    auth.pollForRegistrationCompletion();
    if (! auth.loggedInUsername() &&
        auth.registrationUrl()) {
      Console.error(
        "You need to set a password on your Meteor developer account before",
        "you can claim sites. You can do that here in under a minute:");
      Console.error(Console.url(auth.registrationUrl()));
      Console.error();
    } else {
      Console.error("Couldn't claim site: " + result.errorMessage);
    }
    return 1;
  }

  Console.info(site + ": " + "successfully transferred to your account.");
  Console.info();
  Console.info("Show authorized users with:");
  Console.info(
    Console.command("meteor authorized " + site),
    Console.options({ indent: 2 }));
  Console.info();
  Console.info("Add authorized users with:");
  Console.info(
    Console.command("meteor authorized " + site + " --add <username>"),
    Console.options({ indent: 2 }));
  Console.info();
  Console.info("Remove authorized users with:");
  Console.info(
    Console.command("meteor authorized " + site + " --remove <username>"),
    Console.options({ indent: 2 }));
  Console.info();
  return 0;
};

var listSites = function () {
  var result = deployRpc({
    method: "GET",
    operation: "authorized-apps",
    promptIfAuthFails: true,
    expectPayload: ["sites"]
  });

  if (result.errorMessage) {
    Console.error("Couldn't list sites: " + result.errorMessage);
    return 1;
  }

  if (! result.payload ||
      ! result.payload.sites ||
      ! result.payload.sites.length) {
    Console.info("You don't have any sites yet.");
  } else {
    result.payload.sites.sort();
    _.each(result.payload.sites, function (site) {
      Console.info(site);
    });
  }
  return 0;
};


exports.bundleAndDeploy = bundleAndDeploy;
exports.deleteApp = deleteApp;
exports.temporaryMongoUrl = temporaryMongoUrl;
exports.logs = logs;
exports.listAuthorized = listAuthorized;
exports.changeAuthorized = changeAuthorized;
exports.claim = claim;
exports.listSites = listSites;
