var Future = require('fibers/future');
var readline = require('readline');
var _ = require('underscore');
var archinfo = require('./archinfo.js');
var files = require('./files.js');
var semver = require('semver');
var os = require('os');
var fs = require('fs');

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

(function () {
  var PackageVersion = null;

  var maybeLoadPackageVersionParser = function () {
    if (PackageVersion)
      return;
    var uniload = require('./uniload.js');
    var Package = uniload.load({packages: ['package-version-parser']});
    PackageVersion = Package['package-version-parser'].PackageVersion;
  };

  exports.parseVersionConstraint = function () {
    maybeLoadPackageVersionParser();
    return PackageVersion.parseVersionConstraint.apply(this, arguments);
  };
  exports.parseConstraint = function () {
    maybeLoadPackageVersionParser();
    return PackageVersion.parseConstraint.apply(this, arguments);
  };
})();

// XXX should unify this with utils.parseConstraint
exports.splitConstraint = function (constraint) {
  var m = constraint.split("@");
  var ret = { package: m[0] };
  if (m.length > 1) {
    ret.constraint = m[1];
  } else {
    ret.constraint = null;
  }
  return ret;
};


// XXX should unify this with utils.parseConstraint
exports.dealConstraint = function (constraint, pkg) {
  return { package: pkg, constraint: constraint};
};



// Check for invalid package names. Currently package names can only contain
// ASCII alphanumerics, dash, and dot, and must contain at least one letter. For
// safety reasons, package names may not start with a dot. Package names must be
// lowercase.
//
// This does not check that the package name is valid in terms of our naming
// scheme: ie, that it is prepended by a user's username. That check should
// happen at publication time.
exports.validPackageName = function (packageName) {
 if (/[^a-z0-9:.\-]/.test(packageName) || !/[a-z]/.test(packageName) ) {
   return false;
 }
 return true;
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
  var m = v.match(/^(\d{1,4}(?:\.\d{1,4})*)(?:-([-A-Za-z]{1,15})(\d{0,4}))?$/);
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

exports.isDirectory = function (dir) {
  try {
    // use stat rather than lstat since symlink to dir is OK
    var stats = fs.statSync(dir);
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

exports.displayRelease = function (track, version) {
  var catalog = require('./catalog.js');
  if (track === catalog.official.DEFAULT_TRACK)
    return "Meteor " + version;
  return track + '@' + version;
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
