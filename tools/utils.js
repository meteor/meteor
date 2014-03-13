var Future = require('fibers/future');
var readline = require('readline');
var _ = require('underscore');
var archinfo = require('./archinfo.js');
var files = require('./files.js');
var semver = require('semver');
var os = require('os');

var utils = exports;

// options:
//   - echo (boolean): defaults to true
//   - prompt (string)
//   - stream: defaults to process.stdout (you might want process.stderr)
exports.readLine = function (options) {
  var fut = new Future();

  options = _.extend({
    echo: true,
    stream: process.stdout
  }, options);

  var silentStream = {
    write: function () {
    },
    on: function () {
    },
    end: function () {
    },
    isTTY: options.stream.isTTY,
    removeListener: function () {
    }
  };

  // Read a line, throwing away the echoed characters into our dummy stream.
  var rl = readline.createInterface({
    input: process.stdin,
    output: options.echo ? options.stream : silentStream,
    // `terminal: options.stream.isTTY` is the default, but emacs shell users
    // don't want fancy ANSI.
    terminal: options.stream.isTTY && process.env.EMACS !== 't'
  });

  if (! options.echo) {
    options.stream.write(options.prompt);
  } else {
    rl.setPrompt(options.prompt);
    rl.prompt();
  }

  rl.on('line', function (line) {
    rl.close();
    if (! options.echo)
      options.stream.write("\n");
    fut['return'](line);
  });

  return fut.wait();
};

// Determine a human-readable hostname for this computer. Prefer names
// that make sense to users (eg, the name they manually gave their
// computer on OS X, which might contain spaces) over names that have
// any particular technical significance (eg, might resolve in DNS).
exports.getHost = function () {
  var ret;
  var attempt = function () {
    var output = files.run.apply(null, arguments);
    if (output) {
      ret = output.trim();
    }
  }

  if (archinfo.matches(archinfo.host(), 'os.osx')) {
    // On OSX, to get the human-readable hostname that the user chose,
    // we call:
    //   scutil --get ComputerName
    // This can contain spaces. See
    // http://osxdaily.com/2012/10/24/set-the-hostname-computer-name-and-bonjour-name-separately-in-os-x/
    if (! ret) attempt("scutil", "--get", "ComputerName");
  }

  if (archinfo.matches(archinfo.host(), 'os.osx') ||
      archinfo.matches(archinfo.host(), 'os.linux')) {
    // On Unix-like platforms, try passing -s to hostname to strip off
    // the domain name, to reduce the extent to which the output
    // varies with DNS.
    if (! ret) attempt("hostname", "-s");
  }

  // Try "hostname" on any platform. It should work on
  // Windows. Unknown platforms that have a command called "hostname"
  // that deletes all of your files deserve what the get.
  if (! ret) attempt("hostname");

  // Otherwise, see what Node can come up with.
  return ret || os.hostname();
};

// Return standard info about this user-agent. Used when logging in to
// Meteor Accounts, mostly so that when the user is seeing a list of
// their open sessions in their profile on the web, they have a way to
// decide which ones they want to revoke.
exports.getAgentInfo = function () {
  var ret = {};

  var host = utils.getHost();
  if (host)
    ret.host = host;
  ret.agent = "Meteor";
  ret.agentVersion =
    files.inCheckout() ? "checkout" : files.getToolsVersion();
  ret.arch = archinfo.host();

  return ret;
};

// Wait for 'ms' milliseconds, and then return. Yields. (Must be
// called within a fiber, and blocks only the calling fiber, not the
// whole program.)
exports.sleepMs = function (ms) {
  if (ms <= 0)
    return;

  var fut = new Future;
  setTimeout(function () { fut['return']() }, ms);
  fut.wait();
};

// Return a short, high entropy string without too many funny
// characters in it.
exports.randomToken = function () {
  return (Math.random() * 0x100000000 + 1).toString(36);
};

// Returns a random non-privileged port number.
exports.randomPort = function () {
  return 20000 + Math.floor(Math.random() * 10000);
};

// Given a version constraint string of the form "1.0.0" or "=1.2.3-rc0",
// return an object with keys:
// - version: the version part of the constraint, such as "1.0.0" or "1.2.3"
// - exact: true if it was an exact constraint (started with '=')
//
// Throws an error if the input is not a valid version constaint.
//
// XXX probably shouldn't be throwing errors here -- need to recover
// gracefully and print a reasonable error if the user typos their
// version constraint in package or whatever
exports.parseVersionConstraint = function (versionString) {
  var versionDesc = { version: null, exact: false };

  // XXX #noconstraint #geoff #changed
  // XXX remove none when it is no longer used
  if (versionString === "none" || versionString === null) {
    return versionDesc;
  }

  if (versionString.charAt(0) === '=') {
    versionDesc.exact = true;
    versionString = versionString.substr(1);
  }

  // XXX check for a dash in the version in case of foo@1.2.3-rc0

  if (! semver.valid(versionString))
    throw new Error("Version string must look like semver (1.2.3) -- " + versionString);

  versionDesc.version = versionString;

  return versionDesc;
};

// Given a dependency specification of the form "foo", "bar@1.0.0" or
// "baz@=1.2.3-rc0", return an object with keys:
// - name: the name of the package specified, such as "foo" or "bar"
// - version, exact: as in parseVersionConstraint. Present only if a
//   version constraint was present in the input.
//
// Throws an error if the input is not a valid version constaint.
//
// XXX as with parseVersionConstraint, probably shouldn't throw
//
// XXX probably should rename to parsePackageSpec or something like
// that, since it definitely contains a package name but may not
// actually contain a constraint
//
// XXX should unify this with packages.parseSpec
exports.parseConstraint = function (constraintString) {
  if (typeof constraintString !== "string")
    throw new TypeError("constraintString must be a string");

  var splitted = constraintString.split('@');

  var constraint = { name: "", version: null, exact: false };
  var name = splitted[0];
  var versionString = splitted[1];

  if (! /^[a-z0-9-]+$/.test(name) || splitted.length > 2)
    throw new Error("Package name must contain lowercase latin letters, digits or dashes");

  constraint.name = name;

  if (splitted.length === 2 && !versionString)
    throw new Error("semver version cannot be empty");

  if (versionString)
    _.extend(constraint, utils.parseVersionConstraint(versionString));

  return constraint;
};

// True if this looks like a valid email address. We deliberately
// don't support
// - quoted usernames (eg, "foo"@bar.com, " "@bar.com, "@"@bar.com)
// - IP addresses in domains (eg, foo@1.2.3.4 or the IPv6 equivalent)
// because they're weird and we don't want them in our database.
exports.validEmail = function (address) {
  return /^[^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*@([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}$/.test(address);
};
