var Future = require('fibers/future');
var _ = require('underscore');
var fiberHelpers = require('./fiber-helpers.js');
var archinfo = require('./archinfo.js');
var buildmessage = require('./buildmessage.js');
var files = require('./files.js');
var packageVersionParser = require('./package-version-parser.js');
var semver = require('semver');
var os = require('os');
var url = require('url');

var utils = exports;

// Parses <protocol>://<host>:<port> into an object { protocol: *, host:
// *, port: * }. The input can also be of the form <host>:<port> or just
// <port>. We're not simply using 'url.parse' because we want '3000' to
// parse as {host: undefined, protocol: undefined, port: '3000'}, whereas
// 'url.parse' would give us {protocol:' 3000', host: undefined, port:
// undefined} or something like that.
//
// 'defaults' is an optional object with 'host', 'port', and 'protocol' keys.
var parseUrl = function (str, defaults) {
  // XXX factor this out into a {type: host/port}?

  defaults = defaults || {};
  var defaultHost = defaults.host || undefined;
  var defaultPort = defaults.port || undefined;
  var defaultProtocol = defaults.protocol || undefined;

  if (str.match(/^[0-9]+$/)) { // just a port
    return {
      port: str,
      host: defaultHost,
      protocol: defaultProtocol };
  }

  var hasScheme = exports.hasScheme(str);
  if (! hasScheme) {
    str = "http://" + str;
  }

  var parsed = url.parse(str);
  if (! parsed.protocol.match(/\/\/$/)) {
    // For easy concatenation, add double slashes to protocols.
    parsed.protocol = parsed.protocol + "//";
  }
  return {
    protocol: hasScheme ? parsed.protocol : defaultProtocol,
    host: parsed.hostname || defaultHost,
    port: parsed.port || defaultPort
  };
};

var ipAddress = function () {
  var netroute = require('netroute');
  var info = netroute.getInfo();
  var defaultRoute = _.findWhere(info.IPv4 || [], { destination: "0.0.0.0" });
  if (! defaultRoute) {
    return null;
  }

  var iface = defaultRoute["interface"];

  var getAddress = function (iface) {
    var interfaces = os.networkInterfaces();
    return _.findWhere(interfaces[iface], { family: "IPv4" });
  };

  var address = getAddress(iface);
  if (! address) {
    // Retry after a couple seconds in case the user is connecting or
    // disconnecting from the Internet.
    utils.sleepMs(2000);
    address = getAddress(iface);
    if (! address) {
      throw new Error(
"Interface '" + iface + "' not found in interface list, or\n" +
"does not have an IPv4 address.");
    }
  }
  return address.address;
};

exports.hasScheme = function (str) {
  return !! str.match(/^[A-Za-z][A-Za-z0-9+-\.]*\:\/\//);
};

exports.parseUrl = parseUrl;

exports.ipAddress = ipAddress;

exports.hasScheme = function (str) {
  return !! str.match(/^[A-Za-z][A-Za-z0-9+-\.]*\:\/\//);
};

// XXX: Move to e.g. formatters.js?
// Prints a package list in a nice format.
// Input is an array of objects with keys 'name' and 'description'.
exports.printPackageList = function (items, options) {
  options = options || {};

  var rows = _.map(items, function (item) {
    var name = item.name;
    var description = item.description || 'No description';
    return [name, description];
  });

  var alphaSort = function (row) {
    return row[0];
  };
  rows = _.sortBy(rows, alphaSort);

  var Console = require('./console.js').Console;
  return Console.printTwoColumns(rows, options);
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
  };

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

// Like packageVersionParser.parsePackageConstraint, but if called in a
// buildmessage context uses buildmessage to raise errors.
exports.parsePackageConstraint = function (constraintString, options) {
  try {
    return packageVersionParser.parsePackageConstraint(constraintString);
  } catch (e) {
    if (! (e.versionParserError && options && options.useBuildmessage))
      throw e;
    buildmessage.error(e.message, { file: options.buildmessageFile });
    return null;
  }
};

exports.validatePackageName = function (name, options) {
  try {
    return packageVersionParser.validatePackageName(name, options);
  } catch (e) {
    if (! (e.versionParserError && options && options.useBuildmessage))
      throw e;
    buildmessage.error(e.message, { file: options.buildmessageFile });
    return null;
  }
};

// Parse a string of the form package@version into an object of the form
// {name, version}.
exports.parsePackageAtVersion = function (packageAtVersionString, options) {
  // A string that has to look like "package@version" isn't really a
  // constraint, it's just a string of the form (package + "@" + version).
  // However, using parsePackageConstraint in the implementation is too
  // convenient to pass up (especially in terms of error-handling quality).
  var parsedConstraint = exports.parsePackageConstraint(packageAtVersionString,
                                                        options);
  if (! parsedConstraint) {
    // It must be that options.useBuildmessage and an error has been
    // registered.  Otherwise, parsePackageConstraint would succeed or throw.
    return null;
  }
  var alternatives = parsedConstraint.versionConstraint.alternatives;
  if (! (alternatives.length === 1 &&
         alternatives[0].type === 'compatible-with')) {
    if (options && options.useBuildmessage) {
      buildmessage.error("Malformed package@version: " + packageAtVersionString,
                         { file: options.buildmessageFile });
      return null;
    } else {
      throw new Error("Malformed package@version: " + packageAtVersionString);
    }
  }
  return { package: parsedConstraint.package,
           version: alternatives[0].versionString };
};

// Check for invalid package names. Currently package names can only contain
// ASCII alphanumerics, dash, and dot, and must contain at least one letter. For
// safety reasons, package names may not start with a dot. Package names must be
// lowercase.
//
// These do not check that the package name is valid in terms of our naming
// scheme: ie, that it is prepended by a user's username. That check should
// happen at publication time.
//
// 3 variants: isValidPackageName just returns a bool.  validatePackageName
// throws an error marked with 'versionParserError'. validatePackageNameOrExit
// (which should only be used inside the implementation of a command, not
// eg package-client.js) prints and throws the "exit with code 1" exception
// on failure.

exports.isValidPackageName = function (packageName) {
  try {
    exports.validatePackageName(packageName);
    return true;
  } catch (e) {
    if (!e.versionParserError)
      throw e;
    return false;
  }
};

exports.validatePackageNameOrExit = function (packageName, options) {
  try {
    exports.validatePackageName(packageName, options);
  } catch (e) {
    if (!e.versionParserError)
      throw e;
    var Console = require('./console.js').Console;
    Console.error(e.message, Console.options({ bulletPoint: "Error: " }));
    // lazy-load main: old bundler tests fail if you add a circular require to
    // this file
    var main = require('./main.js');
    throw new main.ExitWithCode(1);
  }
};

// True if this looks like a valid email address. We deliberately
// don't support
// - quoted usernames (eg, "foo"@bar.com, " "@bar.com, "@"@bar.com)
// - IP addresses in domains (eg, foo@1.2.3.4 or the IPv6 equivalent)
// because they're weird and we don't want them in our database.
exports.validEmail = function (address) {
  return /^[^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*@([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}$/.test(address);
};

// Like Perl's quotemeta: quotes all regexp metacharacters. See
//   https://github.com/substack/quotemeta/blob/master/index.js
exports.quotemeta = function (str) {
    return String(str).replace(/(\W)/g, '\\$1');
};

// Allow a simple way to scale up all timeouts from the command line
var timeoutScaleFactor = 1.0;
if (process.env.TIMEOUT_SCALE_FACTOR) {
  timeoutScaleFactor = parseFloat(process.env.TIMEOUT_SCALE_FACTOR);
}
exports.timeoutScaleFactor = timeoutScaleFactor;

// If the given version matches a template (essentially, semver-style, but with
// a bounded number of digits per number part, and with no restriction on the
// amount of number parts, and some restrictions on legal prerelease labels),
// then return an orderKey for it. Otherwise return null.
//
// This conventional orderKey pads each part (with 0s for numbers, and ! for
// prerelease tags), and appends a $. (Because ! sorts before $, this means that
// the prerelease for a given release will sort before it. Because $ sorts
// before '.', this means that 1.2 will sort before 1.2.3.)
exports.defaultOrderKeyForReleaseVersion = function (v) {
  var m = v.match(/^(\d{1,4}(?:\.\d{1,4})*)(?:-([-A-Za-z.]{1,15})(\d{0,4}))?$/);
  if (!m)
    return null;
  var numberPart = m[1];
  var prereleaseTag = m[2];
  var prereleaseNumber = m[3];

  var hasRedundantLeadingZero = function (x) {
    return x.length > 1 && x[0] === '0';
  };
  var leftPad = function (chr, len, str) {
    if (str.length > len)
      throw Error("too long to pad!");
    var padding = new Array(len - str.length + 1).join(chr);
    return padding + str;
  };
  var rightPad = function (chr, len, str) {
    if (str.length > len)
      throw Error("too long to pad!");
    var padding = new Array(len - str.length + 1).join(chr);
    return str + padding;
  };

  // Versions must have no redundant leading zeroes, or else this encoding would
  // be ambiguous.
  var numbers = numberPart.split('.');
  if (_.any(numbers, hasRedundantLeadingZero))
    return null;
  if (prereleaseNumber && hasRedundantLeadingZero(prereleaseNumber))
    return null;

  // First, put together the non-prerelease part.
  var ret = _.map(numbers, _.partial(leftPad, '0', 4)).join('.');

  if (!prereleaseTag)
    return ret + '$';

  ret += '!' + rightPad('!', 15, prereleaseTag);
  if (prereleaseNumber)
    ret += leftPad('0', 4, prereleaseNumber);

  return ret + '$';
};

// XXX should be in files.js
exports.isDirectory = function (dir) {
  try {
    // use stat rather than lstat since symlink to dir is OK
    var stats = files.stat(dir);
  } catch (e) {
    return false;
  }
  return stats.isDirectory();
};

// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
exports.startsWith = function(str, starts) {
  return str.length >= starts.length &&
    str.substring(0, starts.length) === starts;
};

// Options: noPrefix: do not display 'Meteor ' in front of the version number.
exports.displayRelease = function (track, version, options) {
  var catalog = require('./catalog.js');
  options = options || {};
  var prefix = options.noPrefix ? "" : "Meteor ";

  if (catalog.DEFAULT_TRACK !== "WINDOWS-PREVIEW") {
    // XXX HACK for windows. In the bottom of catalog-remote.js, we make the
    // default track for windows be "WINDOWS-PREVIEW", but we want `meteor
    // --version` to actually show "WINDOWS-PREVIEW@x.y.z" instead of just
    // "x.y.z".
    if (track === catalog.DEFAULT_TRACK) {
      return prefix + version;
    }
  }
  return track + '@' + version;
};

exports.splitReleaseName = function (releaseName) {
  var parts = releaseName.split('@');
  var track, version;
  if (parts.length === 1) {
    var catalog = require('./catalog.js');
    track = catalog.DEFAULT_TRACK;
    version = parts[0];
  } else {
    track = parts[0];
    // Do we forbid '@' sign in release versions? I sure hope so, but let's
    // be careful.
    version = parts.slice(1).join("@");
  }
  return [track, version];
};

// Calls cb with each subset of the array "total", with non-decreasing size,
// until all subsets have been used or cb returns true. The array passed
// to cb may be safely mutated or retained by cb.
exports.generateSubsetsOfIncreasingSize = function (total, cb) {
  // We'll throw this if cb ever returns true, which is a simple way to pop us
  // out of our recursion.
  var Done = function () {};

  // Generates all subsets of size subsetSize which contain the indices already
  // in chosenIndices (and no indices that are "less than" any of them).
  var generateSubsetsOfFixedSize = function (goalSize, chosenIndices) {
    // If we've found a subset of the size we're looking for, output it.
    if (chosenIndices.length === goalSize) {
      // Change from indices into the actual elements. Note that 'elements' is
      // a newly allocated array which cb may mutate or retain.
      var elements = [];
      _.each(chosenIndices, function (index) {
        elements.push(total[index]);
      });
      if (cb(elements)) {
        throw new Done();  // unwind all the recursion
      }
      return;
    }

    // Otherwise try adding another index and call this recursively.  We're
    // trying to produce a sorted list of indices, so if there are already
    // indices, we start with the one after the biggest one we already have.
    var firstIndexToConsider = chosenIndices.length ?
          chosenIndices[chosenIndices.length - 1] + 1 : 0;
    for (var i = firstIndexToConsider; i < total.length; ++i) {
      var withThisChoice = _.clone(chosenIndices);
      withThisChoice.push(i);
      generateSubsetsOfFixedSize(goalSize, withThisChoice);
    }
  };

  try {
    for (var goalSize = 0; goalSize <= total.length; ++goalSize) {
      generateSubsetsOfFixedSize(goalSize, []);
    }
  } catch (e) {
    if (!(e instanceof Done))
      throw e;
  }
};

exports.isUrlWithSha = function (x) {
  // For now, just support http/https, which is at least less restrictive than
  // the old "github only" rule.
  return /^https?:\/\/.*[0-9a-f]{40}/.test(x);
};

// If there is a version that isn't exact, throws an Error with a
// human-readable message that is suitable for showing to the user.
// dependencies may be falsey or empty.
//
// This is talking about NPM/Cordova versions specifically, not Meteor versions.
// It does not support the wrap number syntax.
exports.ensureOnlyExactVersions = function (dependencies) {
  _.each(dependencies, function (version, name) {
    // We want a given version of a smart package (package.js +
    // .npm/npm-shrinkwrap.json) to pin down its dependencies precisely, so we
    // don't want anything too vague. For now, we support semvers and urls that
    // name a specific commit by SHA.
    if (! exports.isExactVersion(version)) {
      throw new Error(
        "Must declare exact version of dependency: " + name + '@' + version);
    }
  });
};
exports.isExactVersion = function (version) {
  return semver.valid(version) || exports.isUrlWithSha(version);
};


exports.execFileSync = function (file, args, opts) {
  var future = new Future;

  var child_process = require('child_process');
  var eachline = require('eachline');

  if (opts && opts.pipeOutput) {
    var p = child_process.spawn(file, args, opts);

    eachline(p.stdout, fiberHelpers.bindEnvironment(function (line) {
      process.stdout.write(line + '\n');
    }));

    eachline(p.stderr, fiberHelpers.bindEnvironment(function (line) {
      process.stderr.write(line + '\n');
    }));

    p.on('exit', function (code) {
      future.return(code);
    });

    return {
      success: !future.wait(),
      stdout: "",
      stderr: ""
    };
  }

  child_process.execFile(file, args, opts, function (err, stdout, stderr) {
    future.return({
      success: ! err,
      stdout: stdout,
      stderr: stderr
    });
  });

  return future.wait();
};

exports.execFileAsync = function (file, args, opts) {
  opts = opts || {};
  var child_process = require('child_process');
  var eachline = require('eachline');
  var p = child_process.spawn(file, args, opts);
  var mapper = opts.lineMapper || _.identity;

  var logOutput = fiberHelpers.bindEnvironment(function (line) {
    if (opts.verbose) {
      line = mapper(line);
      if (line)
        console.log(line);
    }
  });

  eachline(p.stdout, logOutput);
  eachline(p.stderr, logOutput);

  return p;
};

exports.Throttled = function (options) {
  var self = this;

  options = _.extend({ interval: 150 }, options || {});
  self.interval = options.interval;
  var now = +(new Date);

  self.next = now;
};

_.extend(exports.Throttled.prototype, {
  isAllowed: function () {
    var self = this;
    var now = +(new Date);

    if (now < self.next) {
      return false;
    }

    self.next = now + self.interval;
    return true;
  }
});


// ThrottledYield just regulates the frequency of calling yield.
// It should behave similarly to calling yield on every iteration of a loop,
// except that it won't actually yield if there hasn't been a long enough time interval
//
// options:
//   interval: minimum interval of time between yield calls
//             (more frequent calls are simply dropped)
exports.ThrottledYield = function (options) {
  var self = this;

  self._throttle = new exports.Throttled(options);
};

_.extend(exports.ThrottledYield.prototype, {
  yield: function () {
    var self = this;
    if (self._throttle.isAllowed()) {
      var f = new Future;
      // setImmediate allows signals and IO to be processed but doesn't
      // otherwise add time-based delays. It is better for yielding than
      // process.nextTick (which doesn't allow signals or IO to be processed) or
      // setTimeout 1 (which adds a minimum of 1 ms and often more in delays).
      // XXX Actually, setImmediate is so fast that we might not even need
      // to use the throttler at all?
      setImmediate(function () {
        f.return();
      });
      f.wait();
    }
  }
});


// Are we running on device?
exports.runOnDevice = function (options) {
  return !! _.intersection(options.args,
    ['ios-device', 'android-device']).length;
};

// Given the options for a 'meteor run' command, returns a parsed URL ({
// host: *, protocol: *, port: * }. The rules for --mobile-server are:
//   * If you don't specify anything for --mobile-server, then it
//     defaults to <detected ip address>:<port from --port>.
//   * If you specify something for --mobile-server, we use that,
//     defaulting to http:// as the protocol and 80 or 443 as the port.
exports.mobileServerForRun = function (options) {
  // we want to do different IP generation depending on whether we
  // are running for a device or simulator
  options = _.extend({}, options, {
    runOnDevice: exports.runOnDevice(options)
  });

  var parsedUrl = parseUrl(options.port);
  if (! parsedUrl.port) {
    throw new Error("--port must include a port.");
  }

  // XXX COMPAT WITH 0.9.2.2 -- the 'mobile-port' option is deprecated
  var mobileServer = options["mobile-server"] || options["mobile-port"];


  // if we specified a mobile server, use that

  if (mobileServer) {
    var parsedMobileServer = parseUrl(mobileServer, {
      protocol: "http://"
    });

    if (! parsedMobileServer.host) {
      throw new Error("--mobile-server must specify a hostname.");
    }

    return parsedMobileServer;
  }


  // if we are running on a device, use the auto-detected IP

  if (options.runOnDevice) {
    var myIp = ipAddress();
    if (! myIp) {
      throw new Error(
"Error detecting IP address for mobile app to connect to.\n" +
"Please specify the address that the mobile app should connect\n" +
"to with --mobile-server.");
    }

    return {
      host: myIp,
      port: parsedUrl.port,
      protocol: "http://"
    };
  }

  // we are running a simulator, use localhost:3000
  return {
    host: "localhost",
    port: parsedUrl.port,
    protocol: "http://"
  };
};

// Use this to convert dates into our preferred human-readable format.
//
// Takes in either null, a raw date string (ex: 2014-12-09T18:37:48.977Z) or a
// date object and returns a long-form human-readable date (ex: December 9th,
// 2014) or unknown for null.
exports.longformDate = function (date) {
  if (! date) return "Unknown";
  var moment = require('moment');
  var pubDate = moment(date).format('MMMM Do, YYYY');
  return pubDate;
};

// Length of the longest possible string that could come out of longformDate
// (September is the longest month name, so "September 24th, 2014" would be an
// example).
exports.maxDateLength = "September 24th, 2014".length;

// If we have failed to update the catalog, informs the user and advises them to
// go online for up to date inforation.
exports.explainIfRefreshFailed = function () {
  var Console = require("./console.js").Console;
  var catalog = require('./catalog.js');
  if (catalog.official.offline || catalog.refreshFailed) {
    Console.info("Your package catalog may be out of date.\n" +
      "Please connect to the internet and try again.");
  }
};

// Returns a sha256 hash of a given string.
exports.sha256 = function (contents) {
  var crypto = require('crypto');
  var hash = crypto.createHash('sha256');
  hash.update(contents);
  return hash.digest('base64');
};
