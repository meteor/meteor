// This file is in tools/package-version-parser.js and is symlinked into
// packages/package-version-parser/package-version-parser.js. It's part of both
// the tool and the package!  We don't use an isopacket for it because it used
// to be required as part of building isopackets (though that may no longer be
// true).
var inTool = typeof Package === 'undefined';


var semver = inTool ?
  require ('../../dev_bundle/lib/node_modules/semver') : SemVer410;
var __ = inTool ? require('../../dev_bundle/lib/node_modules/underscore') : _;

// Takes in a meteor version string, for example 1.2.3-rc.5_1+12345.
//
// Returns an object composed of the following:
//  * major (integer >= 0)
//  * minor (integer >= 0)
//  * patch (integer >= 0)
//  * prerelease (Array of Number-or-String, possibly empty)
//  * wrapNum (integer >= 0)
//  * build (Array of String, possibly empty)
//  * raw (String), the raw meteor version string
//  * version (String), canonical meteor version without build ID
//  * semver (String), canonical semver version with build ID but no wrap num
//
// The input string "1.2.3-rc.5_1+12345" has a (major, minor, patch) of
// (1, 2, 3), a prerelease of ["rc", 5], a wrapNum of 1, a build of
// ["12345"], a raw of "1.2.3-rc.5_1+12345", a version of
// "1.2.3-rc.5_1", and a semver of "1.2.3-rc.5+12345".
//
// Throws if the version string is invalid in any way.
//
// You can write `PV.parse("1.2.3")` as an alternative to `new PV("1.2.3")`
var PV = function (versionString) {
  if (! (typeof versionString === 'string')) {
    throw new Error("Invalid PackageVersion argument: " + versionString);
  }
  if (! versionString) {
    throwVersionParserError("Empty string is not a valid version");
  }

  // The buildID ("+foo" suffix) is part of semver, but split it off
  // because it comes after the wrapNum.  The wrapNum ("_123" suffix)
  // is a Meteor extension to semver.
  var plusSplit = versionString.split('+');
  var wrapSplit = plusSplit[0].split('_');
  var wrapNum = 0;

  if (plusSplit.length > 2) {
    throwVersionParserError("Can't have two + in version: " + versionString);
  }
  if (wrapSplit.length > 2) {
    throwVersionParserError("Can't have two _ in version: " + versionString);
  }
  if (wrapSplit.length > 1) {
    wrapNum = wrapSplit[1];
    if (! wrapNum) {
      throwVersionParserError("A wrap number must follow _");
    } else if (!/^\d+$/.test(wrapNum)) {
      throwVersionParserError(
        "The wrap number (after _) must contain only digits, so " +
          versionString + " is invalid.");
    } else if (wrapNum[0] === "0") {
      throwVersionParserError(
        "The wrap number (after _) must not have a leading zero, so " +
          versionString + " is invalid.");
    }
    wrapNum = parseInt(wrapNum, 10);
  }

  // semverPart is everything but the wrapNum, so for "1.0.0_2+xyz",
  // it is "1.0.0+xyz".
  var semverPart = wrapSplit[0];
  if (plusSplit.length > 1) {
    semverPart += "+" + plusSplit[1];
  }

  // NPM's semver spec supports things like 'v1.0.0' and considers them valid,
  // but we don't. Everything before the + or - should be of the x.x.x form.
  if (! /^\d+\.\d+\.\d+(\+|-|$)/.test(semverPart)) {
    throwVersionParserError(
      "Version string must look like semver (eg '1.2.3'), not '"
        + versionString + "'.");
  };

  var semverParse = semver.parse(semverPart);
  if (! semverParse) {
    throwVersionParserError(
      "Version string must look like semver (eg '1.2.3'), not '"
        + semverPart + "'.");
  }

  this.major = semverParse.major; // Number
  this.minor = semverParse.minor; // Number
  this.patch = semverParse.patch; // Number
  this.prerelease = semverParse.prerelease; // [OneOf(Number, String)]
  this.wrapNum = wrapNum; // Number
  this.build = semverParse.build; // [String]
  this.raw = versionString; // the entire version string
  // `.version` is everything but the build ID ("+foo"), and it
  // has been run through semver's canonicalization, ie "cleaned"
  // (for whatever that's worth)
  this.version = semverParse.version + (wrapNum ? '_' + wrapNum : '');
  // everything but the wrapnum ("_123")
  this.semver = semverParse.version + (
    semverParse.build.length ? '+' + semverParse.build.join('.') : '');
};

PV.parse = function (versionString) {
  return new PV(versionString);
};

if (inTool) {
  module.exports = PV;
} else {
  PackageVersion = PV;
}

// Converts a meteor version into a large floating point number, which
// is (more or less [*]) unique to that version. Satisfies the
// following guarantee: If PV.lessThan(v1, v2) then
// PV.versionMagnitude(v1) < PV.versionMagnitude(v2) [*]
//
// [* XXX!] We don't quite satisfy the uniqueness and comparison properties in
// these cases:
// 1. If any of the version parts are greater than 100 (pretty unlikely?)
// 2. If we're dealing with a prerelease version, we only look at the
//    first two characters of each prerelease part. So, "1.0.0-beta" and
//    "1.0.0-bear" will have the same magnitude.
// 3. If we're dealing with a prerelease version with more than two parts, eg
//    "1.0.0-rc.0.1". In this comparison may fail since we'd get to the limit
//    of JavaScript floating point precision.
//
// If we wanted to fix this, we'd make this function return a BigFloat
// instead of a vanilla JavaScript number. That will make the
// constraint solver slower (by how much?), and would require some
// careful thought.
// (Or it could just return some sort of tuple, and ensure that
// the cost functions that consume this can deal with tuples...)
PV.versionMagnitude = function (versionString) {
  var v = PV.parse(versionString);

  return v.major * 100 * 100 +
    v.minor * 100 +
    v.patch +
    v.wrapNum / 100 +
    prereleaseIdentifierToFraction(v.prerelease) / 100 / 100;
};

// Accepts an array, eg ["rc", 2, 3]. Returns a number in the range
// (-1, 0].  An empty array returns 0. A non-empty string returns a
// number that is "as large" as the its precedence.
var prereleaseIdentifierToFraction = function (prerelease) {
  if (prerelease.length === 0)
    return 0;

  return __.reduce(prerelease, function (memo, part, index) {
    var digit;
    if (typeof part === 'number') {
      digit = part+1;
    } else if (typeof part === 'string') {
      var VALID_CHARACTERS =
            "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

      var validCharToNumber = function (ch) {
        var result = VALID_CHARACTERS.indexOf(ch);
        if (result === -1)
          throw new Error("Unexpected character in prerelease identifier: " + ch);
        else
          return result;
      };

      digit = 101 + // Numeric parts always have lower precedence than non-numeric parts.
        validCharToNumber(part[0]) * VALID_CHARACTERS.length +
        (part[1] ? validCharToNumber(part[1]) : 0);
    } else {
      throw new Error("Unexpected prerelease identifier part: " + part + " of type " + typeof part);
    }

    // 4100 > 101 + VALID_CHARACTERS.length *
    // VALID_CHARACTERS.length. And there's a test to verify this
    // ("test the edges of `versionMagnitude`")
    return memo + digit / Math.pow(4100, index+1);
  }, -1);
};

// Takes in two meteor versions. Returns true if the first one is less than the second.
// Versions are strings or PackageVersion objects.
PV.lessThan = function (versionOne, versionTwo) {
  return PV.compare(versionOne, versionTwo) < 0;
};

// Given a string version, returns its major version (the first section of the
// semver), as an integer. Two versions are compatible if they have the same
// version number.
//
// versionString: valid meteor version string.
PV.majorVersion = function (versionString) {
  return PV.parse(versionString).major;
};

// Takes in two meteor versions. Returns 0 if equal, a positive number if v1
// is greater, a negative number if v2 is greater.
// Versions are strings or PackageVersion objects.
PV.compare = function (versionOne, versionTwo) {
  var v1 = versionOne;
  if (typeof v1 === 'string') {
    v1 = PV.parse(v1);
  }
  var v2 = versionTwo;
  if (typeof v2 === 'string') {
    v2 = PV.parse(v2);
  }

  // If the semver parts are different, use the semver library to compare,
  // ignoring wrap numbers.  (The semver library will ignore the build ID
  // per the semver spec.)
  if (v1.semver !== v2.semver) {
    return semver.compare(v1.semver, v2.semver);
  } else {
    // If the semver components are equal, then the one with the smaller wrap
    // numbers is smaller.
    return v1.wrapNum - v2.wrapNum;
  }
};

// Conceptually we have three types of constraints:
// 1. "compatible-with" - A@x.y.z - constraints package A to version x.y.z or
//    higher, as long as the version is backwards compatible with x.y.z.
//    "pick A compatible with x.y.z"
//    It is the default type.
// 2. "exactly" - A@=x.y.z - constraints package A only to version x.y.z and
//    nothing else.
//    "pick A exactly at x.y.z"
// 3. "any-reasonable" - "A"
//    Basically, this means any version of A ... other than ones that have
//    dashes in the version (ie, are prerelease) ... unless the prerelease
//    version has been explicitly selected (which at this stage in the game
//    means they are mentioned in a top-level constraint in the top-level
//    call to the resolver).
var parseSimpleConstraint = function (constraintString) {
  if (! constraintString) {
    throw new Error("Non-empty string required");
  }

  var type, versionString;

  if (constraintString.charAt(0) === '=') {
    type = "exactly";
    versionString = constraintString.substr(1);
  } else {
    type = "compatible-with";
    versionString = constraintString;
  }

  // This will throw if the version string is invalid.
  PV.getValidServerVersion(versionString);

  return { type: type, versionString: versionString };
};


// Check to see if the versionString that we pass in is a valid meteor version.
//
// Returns a valid meteor version string that can be included in the
// server. That means that it has everything EXCEPT the build id. Throws if the
// entered string was invalid.
PV.getValidServerVersion = function (meteorVersionString) {
  return PV.parse(meteorVersionString).version;
};

PV.VersionConstraint = function (vConstraintString) {
  var alternatives;
  // If there is no version string ("" or null), then our only
  // constraint is any-reasonable.
  if (! vConstraintString) {
    // .versionString === null is relied on in the tool
    alternatives =
      [ { type: "any-reasonable", versionString: null } ];
    vConstraintString = "";
  } else {
    // Parse out the versionString.
    var parts = vConstraintString.split(/ *\|\| */);
    alternatives = __.map(parts, function (alt) {
      if (! alt) {
        throwVersionParserError("Invalid constraint string: " +
                                vConstraintString);
      }
      return parseSimpleConstraint(alt);
    });
  }

  this.raw = vConstraintString;
  this.alternatives = alternatives;
};

PV.parseVersionConstraint = function (constraintString) {
  return new PV.VersionConstraint(constraintString);
};

// A PackageConstraint consists of a package name and a version constraint.
// Call either with args (package, versionConstraintString) or
// (packageConstraintString), or (package, versionConstraint).
// That is, ("foo", "1.2.3") or ("foo@1.2.3"), or ("foo", vc) where vc
// is instanceof PV.VersionConstraint.
PV.PackageConstraint = function (part1, part2) {
  if ((typeof part1 !== "string") ||
      (part2 && (typeof part2 !== "string") &&
       ! (part2 instanceof PV.VersionConstraint))) {
    throw new Error("constraintString must be a string");
  }

  var packageName, versionConstraint, vConstraintString;
  if (part2) {
    packageName = part1;
    if (part2 instanceof PV.VersionConstraint) {
      versionConstraint = part2;
    } else {
      vConstraintString = part2;
    }
  } else if (part1.indexOf("@") >= 0) {
    // Shave off last part after @, with "a@b@c" becoming ["a@b", "c"].
    // Validating the package name will catch extra @.
    var parts = part1.match(/^(.*)@([^@]*)$/).slice(1);
    packageName = parts[0];
    vConstraintString = parts[1];
    if (! vConstraintString) {
      throwVersionParserError(
        "Version constraint for package '" + packageName +
          "' cannot be empty; leave off the @ if you don't want to constrain " +
          "the version.");
    }
  } else {
    packageName = part1;
    vConstraintString = "";
  }

  PV.validatePackageName(packageName);
  if (versionConstraint) {
    vConstraintString = versionConstraint.raw;
  } else {
    versionConstraint = PV.parseVersionConstraint(vConstraintString);
  }

  this.package = packageName;
  this.constraintString = vConstraintString;
  this.versionConstraint = versionConstraint;
};

PV.PackageConstraint.prototype.toString = function () {
  var ret = this.package;
  if (this.constraintString) {
    ret += "@" + this.constraintString;
  }
  return ret;
};

// Structure of a parsed constraint:
//
// /*PV.PackageConstraint*/
// { package: String,
//   constraintString: String,
//   versionConstraint: /*PV.VersionConstraint*/ {
//     raw: String,
//     alternatives: [{versionString: String|null,
//                     type: String}]}}
PV.parsePackageConstraint = function (part1, part2) {
  return new PV.PackageConstraint(part1, part2);
};

PV.validatePackageName = function (packageName, options) {
  options = options || {};

  var badChar = packageName.match(/[^a-z0-9:.\-]/);
  if (badChar) {
    if (options.detailedColonExplanation) {
      throwVersionParserError(
        "Bad character in package name: " + JSON.stringify(badChar[0]) +
          ".\n\nPackage names can only contain lowercase ASCII alphanumerics, " +
          "dash, or dot.\nIf you plan to publish a package, it must be " +
          "prefixed with your\nMeteor Developer Account username and a colon.");
    }
    throwVersionParserError(
      "Package names can only contain lowercase ASCII alphanumerics, dash, " +
        "dot, or colon, not " + JSON.stringify(badChar[0]) + ".");
  }
  if (!/[a-z]/.test(packageName)) {
    throwVersionParserError("Package name must contain a lowercase ASCII letter: "
                            + JSON.stringify(packageName));
  }
  if (packageName[0] === '.') {
    throwVersionParserError("Package name may not begin with a dot: "
                            + JSON.stringify(packageName));
  }
  if (packageName.slice(-1) === '.') {
    throwVersionParserError("Package name may not end with a dot: "
                            + JSON.stringify(packageName));
  }

  if (packageName.slice(-1) === '.') {
    throwVersionParserError("Package names may not end with a dot: " +
                            JSON.stringify(packageName));
  }
  if (packageName.indexOf('..') >= 0) {
    throwVersionParserError("Package names may not contain two consecutive dots: " +
                            JSON.stringify(packageName));
  }
  if (packageName[0] === '-') {
    throwVersionParserError("Package names may not begin with a hyphen: " +
                            JSON.stringify(packageName));
  }
  // (There is already a package ending with a `-` and one with two consecutive `-`
  // in troposphere, though they both look like typos.)

  if (packageName[0] === ":" || __.last(packageName) === ":") {
    throwVersionParserError("Package names may not start or end with a colon: " +
                            JSON.stringify(packageName));
  }
};

var throwVersionParserError = function (message) {
  var e = new Error(message);
  e.versionParserError = true;
  throw e;
};

// Return true if the version constraint was invalid prior to 0.9.3
// (adding _ and || support)
//
// NOTE: this is not used on the client yet. This package is used by the
// package server to determine what is valid.
PV.invalidFirstFormatConstraint = function (validConstraint) {
  if (!validConstraint) return false;
  // We can check this easily right now, because we introduced some new
  // characters. Anything with those characters is invalid prior to
  // 0.9.3. XXX: If we ever have to go through these, we should write a more
  // complicated regex.
  return (/_/.test(validConstraint) ||
          /\|/.test(validConstraint));
};

// Remove a suffix like "+foo" if present.
PV.removeBuildID = function (versionString) {
  return versionString.replace(/\+.*$/, '');
};
