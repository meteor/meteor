// This file is in tools/package-version-parser.js and is symlinked into
// packages/package-version-parser/package-version-parser.js. It's part
// of both the tool and the package!  We don't use uniload for it because
// it needs to be used as part of initializing the uniload catalog.
var inTool = typeof Package === 'undefined';

var PV;
if (inTool) {
  PV = exports;
} else {
  PackageVersion = PV = {};
}

var semver = inTool ? require ('semver') : Npm.require('semver');
var __ = inTool ? require('underscore') : _;

// Takes in a meteor version, for example 1.2.3-rc5~1+12345.
//
// Returns an object composed of the following:
//   semver: (ex: 1.2.3)
//   wrapNum: 0 or a valid wrap number.
//
// Throws if the wrapNumber is invalid, or if the version cannot be split
// reasonably.
var extractSemverPart = function (versionString) {
  if (!versionString) return { semver: "", wrapNum: -1 };
  var noBuild = versionString.split('+');
  var splitVersion = noBuild[0].split('~');
  var wrapNum = 0;
  // If we find two +s, or two ~, that's super invalid.
  if (noBuild.length > 2 || splitVersion.length > 2) {
    throwVersionParserError(
      "Version string must look like semver (eg '1.2.3'), not '"
        + versionString + "'.");
  } else if (splitVersion.length > 1) {
    wrapNum = splitVersion[1];
    if (!/^\d+$/.test(wrapNum)) {
      throwVersionParserError(
        "The wrap number (after ~) must contain only digits, so " +
          versionString + " is invalid.");
    } else if (wrapNum[0] === "0") {
      throwVersionParserError(
        "The wrap number (after ~) must not have a leading zero, so " +
          versionString + " is invalid.");
    }
  }
  return {
    semver: (noBuild.length > 1) ?
      splitVersion[0] + "+" + noBuild[1] :
      splitVersion[0],
    wrapNum: wrapNum
  };
};

// Converts a meteor version into a very large number, unique to that version.
PV.versionMagnitude = function (versionString) {
 // var v = semver.parse(versionString);
 // return v.major * 10000 + v.minor * 100 + v.patch;

  var version = extractSemverPart(versionString);
  var v = semver.parse(version.semver);
  // XXX: This is kind of hacky and relies on not having more than 100 wrap
  // numbers, for example. Probably OK.
  return v.major * 1000000 + v.minor * 10000 +
    v.patch * 100 + version.wrapNum;
};

// Takes in two meteor versions. Returns true if the first one is less than the second.
PV.lessThan = function (versionOne, versionTwo) {
  return PV.compare(versionOne, versionTwo) < 0;
};

// Given a string version, computes its default ECV (not counting any overrides).
//
// versionString: valid meteor version string.
PV.defaultECV = function (versionString) {
  var version = extractSemverPart(versionString).semver;
  var parsed = semver.parse(version);
  if (! parsed)
     throwVersionParserError("not a valid version: " + version);
  return parsed.major + ".0.0";
}

// Takes in two meteor versions. Returns 0 if equal, 1 if v1 is greater, -1 if
// v2 is greater.
PV.compare = function (versionOne, versionTwo) {
  var meteorVOne = extractSemverPart(versionOne);
  var meteorVTwo = extractSemverPart(versionTwo);

  // Wrap numbers only matter if the semver is equal, so if they don't even have
  // wrap numbers, or if their semver is not equal, then we should let the
  // semver library resolve this one.
  if (meteorVOne.semver !== meteorVTwo.semver) {
    return semver.compare(meteorVOne.semver, meteorVTwo.semver);
  }

  // If their semver components are equal, then the one with the smaller wrap
  // numbers is smaller.
  return meteorVOne.wrapNum - meteorVTwo.wrapNum;
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
//
// Options:
//    removeBuildIDs:  Remove the build ID at the end of the version.
PV.parseVersionConstraint = function (versionString, options) {
  options = options || {};
  var versionDesc = { version: null, type: "any-reasonable" };

  if (!versionString) {
    return versionDesc;
  }

  if (versionString.charAt(0) === '=') {
    versionDesc.type = "exactly";
    versionString = versionString.substr(1);
  } else {
    versionDesc.type = "compatible-with";
  }

  // This will throw if the version string is invalid.
  PV.getValidServerVersion(versionString);

  if (options.removeBuildIDs) {
    versionString = versionString.replace(/\+.*$/, '');
   }

  versionDesc.version = versionString;

  return versionDesc;
};


// Check to see if the versionString that we pass in is a valid meteor version.
//
// Returns a valid meteor version string that can be included in the
// server. That means that it has everything EXCEPT the build id. Throws if the
// entered string was invalid.
PV.getValidServerVersion = function (meteorVersionString) {

  // Strip out the wrapper num, if present and check that it is valid.
  var version = extractSemverPart(meteorVersionString);

  var versionString = version.semver;
  // NPM's semver spec supports things like 'v1.0.0' and considers them valid,
  // but we don't. Everything before the + or - should be of the x.x.x form.
  var mainVersion = versionString.split('+')[0].split('-')[0];
  if (! /^\d+\.\d+\.\d+$/.test(mainVersion)) {
      throwVersionParserError(
        "Version string must look like semver (eg '1.2.3'), not '"
          + versionString + "'.");
  };

  var cleanVersion = semver.valid(versionString);
  if (! cleanVersion ) {
    throwVersionParserError(
      "Version string must look like semver (eg '1.2.3'), not '"
        + versionString + "'.");
  }

  if (version.wrapNum) {
    cleanVersion = cleanVersion + "~" + version.wrapNum;
  }

  return cleanVersion;
};


PV.parseConstraint = function (constraintString, options) {
  if (typeof constraintString !== "string")
    throw new TypeError("constraintString must be a string");
  options = options || {};

  var splitted = constraintString.split('@');

  var name = splitted[0];
  var versionString = splitted[1];

  if (splitted.length > 2) {
    // throw error complaining about @
    PV.validatePackageName('a@');
  }

  if (options.archesOK) {
    var newNames = name.split('#');
    if (newNames.length > 2) {
      // It is invalid and should register as such. This will throw.
      PV.validatePackageName(name);
    }
    PV.validatePackageName(newNames[0]);
  } else {
    PV.validatePackageName(name);
  }

  if (splitted.length === 2 && !versionString) {
    throwVersionParserError(
      "Version constraint for package '" + name +
        "' cannot be empty; leave off the @ if you don't want to constrain " +
        "the version.");
  }

  var constraint = {
    name: name
  };

  // Before we parse through versionString, we save it for future output.
  constraint.constraintString = versionString;

  // If we did not specify a version string, then our only constraint is
  // any-reasonable, so we are going to return that.
  if (!versionString) {
    constraint.constraints =
      [ { version: null, type: "any-reasonable" } ];
    return constraint;
  }

  // Let's parse out the versionString.
  var versionConstraints = versionString.split(' || ');
  constraint.constraints = [];
  __.each(versionConstraints, function (versionCon) {
    constraint.constraints.push(
      PV.parseVersionConstraint(versionCon, options));
  });

  return constraint;
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
    throwVersionParserError("Package names must contain a lowercase ASCII letter.");
  }
  if (packageName[0] === '.') {
    throwVersionParserError("Package names may not begin with a dot.");
  }
};

var throwVersionParserError = function (message) {
  var e = new Error(message);
  e.versionParserError = true;
  throw e;
};

PV.constraintToFullString = function (parsedConstraint) {
  return parsedConstraint.name + "@" + parsedConstraint.constraintString;
};


// Return true if the version constraint was invalid prior to 0.9.3
// (adding ~ and || support)
//
// NOTE: this is not used on the client yet. This package is used by the
// package server to determine what is valid.
PV.invalidFirstFormatConstraint = function (validConstraint) {
  if (!validConstraint) return false;
  // We can check this easily right now, because we introduced some new
  // characters. Anything with those characters is invalid prior to
  // 0.9.3. XXX: If we ever have to go through these, we should write a more
  // complicated regex.
  return (/~/.test(validConstraint) ||
          /\|/.test(validConstraint));
};
