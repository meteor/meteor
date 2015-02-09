var CS = ConstraintSolver;
var PV = PackageVersion;

CS.VersionPricer = function () {
  var self = this;

  // VersionPricer instance stores a memoization table for parsing
  // version strings like "1.2.3" into objects.
  self.getVersionInfo = _.memoize(PV.parse);
};

CS.VersionPricer.MODE_UPDATE = 1;
CS.VersionPricer.MODE_GRAVITY = 2;
CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES = 3;

// scanVersions performs the task of assigning small integer costs
// (penalty weights) to versions based on how new or old
// their major, minor, patch, and other version parts are.
// The versions are provided in sorted order (oldest to newest).
// Conceptually, you could imagine splitting the single array
// into subarrays with the same major version, and then splitting
// those arrays by minor version, and then those arrays by patch
// version.  If you did so, each version would be indexed by a
// quadruple of small integers.  This leads to four costs for each
// version, the "major", "minor", "patch", and "rest" costs, where
// the cost is either the index or the index counted from the end
// of the array instead of the beginning (depending on the mode
// parameter).
//
// For efficiency of implementation, we don't generate a bunch of
// nested arrays as described above, but instead perform a single
// traversal backwards through the array while calculating the
// indices and accumulating them into an array for each type of
// index.
//
// The return value is an array of four arrays, each having
// the same length as the input `versions` array.  The elements of
// these arrays correspond to the elements of the `versions` array.
//
// MODE_UPDATE penalizes versions for being old (because we want
// them to be new), while the MODE_GRAVITY penalizes versions for
// being new (because we are trying to apply "version gravity" and
// prefer older versions).  MODE_GRAVITY_WITH_PATCHES applies gravity
// to the major and minor parts of the version, but prefers updates
// to the patch and rest of the version.
//
// Use `versionAfter` when scanning a partial array of versions
// if you want the newest version in the array to have a non-zero
// weight in MODE_UPDATE.  For example, the versions
// `["1.0.0", "1.0.1"]` will be considered to have an out-of-date
// version if versionAfter is `"2.0.0"`.  The costs returned
// won't be the same as if the whole array was scanned at once,
// but this option is useful in order to apply MODE_UPDATE to some
// versions and MODE_GRAVITY to others, for example.
//
// `versionBefore` is used in an analogous way with the GRAVITY modes.
//
// - `versions` - Array of version strings in sorted order
// - `mode` - A MODE constant
// - `options`:
//   - `versionAfter` - if provided, the next newer version not in the
//     array but that would come next.
//   - `versionBefore` - if provided, the next older version not in the
//     the array but that would come before it.
CS.VersionPricer.prototype.scanVersions = function (versions, mode, options) {
  var self = this;

  var majorGravity = false;
  var minorGravity = false;
  var patchGravity = false;
  var restGravity = false;
  switch (mode) {
  case CS.VersionPricer.MODE_UPDATE:
    break;
  case CS.VersionPricer.MODE_GRAVITY:
    majorGravity = minorGravity = patchGravity = restGravity = true;
    break;
  case CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES:
    majorGravity = minorGravity = true;
    break;
  default:
    throw new Error("Bad mode: " + mode);
  }
  var oldnessMajor = 0;
  var oldnessMinor = 0;
  var oldnessPatch = 0;
  var oldnessRest = 0;
  var lastVInfo = null;
  if (options && options.versionAfter) {
    lastVInfo = self.getVersionInfo(options.versionAfter);
  }
  var major = [];
  var minor = [];
  var patch = [];
  var rest = [];
  var countOfSameMajor = 0;
  var countOfSameMinor = 0;
  var countOfSamePatch = 0;
  for (var i = versions.length - 1; i >= 0; i--) {
    var v = versions[i];
    var vInfo = self.getVersionInfo(v);
    if (lastVInfo) {
      if (vInfo.major !== lastVInfo.major) {
        oldnessMajor++;
        if (minorGravity) {
          flipLastN(minor, countOfSameMajor, oldnessMinor);
        }
        if (patchGravity) {
          flipLastN(patch, countOfSameMinor, oldnessPatch);
        }
        if (restGravity) {
          flipLastN(rest, countOfSamePatch, oldnessRest);
        }
        countOfSameMajor = countOfSameMinor = countOfSamePatch = 0;
        oldnessMinor = oldnessPatch = oldnessRest = 0;
      } else if (vInfo.minor !== lastVInfo.minor) {
        oldnessMinor++;
        if (patchGravity) {
          flipLastN(patch, countOfSameMinor, oldnessPatch);
        }
        if (restGravity) {
          flipLastN(rest, countOfSamePatch, oldnessRest);
        }
        countOfSameMinor = countOfSamePatch = 0;
        oldnessPatch = oldnessRest = 0;
      } else if (vInfo.patch !== lastVInfo.patch) {
        oldnessPatch++;
        if (restGravity) {
          flipLastN(rest, countOfSamePatch, oldnessRest);
        }
        countOfSamePatch = 0;
        oldnessRest = 0;
      } else {
        oldnessRest++;
      }
    }
    major.push(oldnessMajor);
    minor.push(oldnessMinor);
    patch.push(oldnessPatch);
    rest.push(oldnessRest);
    countOfSameMajor++;
    countOfSameMinor++;
    countOfSamePatch++;
    lastVInfo = vInfo;
  }
  if (options && options.versionBefore && versions.length) {
    var vbInfo = self.getVersionInfo(options.versionBefore);
    if (vbInfo.major !== lastVInfo.major) {
      oldnessMajor++;
    } else if (vbInfo.minor !== lastVInfo.minor) {
      oldnessMinor++;
    } else if (vbInfo.patch !== lastVInfo.patch) {
      oldnessPatch++;
    } else {
      oldnessRest++;
    }
  }
  if (majorGravity) {
    flipLastN(major, major.length, oldnessMajor);
  }
  if (minorGravity) {
    flipLastN(minor, countOfSameMajor, oldnessMinor);
  }
  if (patchGravity) {
    flipLastN(patch, countOfSameMinor, oldnessPatch);
  }
  if (restGravity) {
    flipLastN(rest, countOfSamePatch, oldnessRest);
  }

  return [major.reverse(), minor.reverse(), patch.reverse(), rest.reverse()];
};

// "Flip" the last N elements of array in place by subtracting each
// one from their maximum (which is known to the caller and passed in
// as `max`).  For example, if `a` is `[3,0,1,1,2]`, then calling
// `flipLastN(a, 4, 2)` mutates `a` into `[3,2,1,1,0]`.
var flipLastN = function (array, N, max) {
  var len = array.length;
  for (var i = 0; i < N; i++) {
    var j = len - 1 - i;
    array[j] = max - array[j];
  }
};

// Categorize versions into `before`, `after`, and `higherMajor` groups.
// Takes a sorted array of versions and a "pivot" version and returns
// three sorted arrays, obtained by slicing up the original array.
// `after` actually contains the versions that are greater than or equal
// to the pivot but do not have a higher major version.
//
// For example, `["1.0.0", "2.5.0", "2.6.1", "3.0.0"]` with a pivot of
// `"2.5.0"` returns `{ before: ["1.0.0"], after: ["2.5.0", "2.6.1"],
// higherMajor: ["3.0.0"] }`.
CS.VersionPricer.prototype.categorizeVersions = function (versions, pivot) {
  var self = this;
  var firstGteIndex = versions.length;
  var higherMajorIndex = versions.length;
  var pivotVInfo = self.getVersionInfo(pivot);
  for (var i = 0; i < versions.length; i++) {
    var v = versions[i];
    var vInfo = self.getVersionInfo(v);
    if (firstGteIndex === versions.length &&
        ! PV.lessThan(vInfo, pivotVInfo)) {
      firstGteIndex = i;
    }
    if (vInfo.major > pivotVInfo.major) {
      higherMajorIndex = i;
      break;
    }
  }
  return { before: versions.slice(0, firstGteIndex),
           after: versions.slice(firstGteIndex, higherMajorIndex),
           higherMajor: versions.slice(higherMajorIndex) };
};

var zeroFunc = function () { return 0; };
var oneFunc = function () { return 1; };

// Use a combination of calls to scanVersions with different modes in order
// to generate costs for versions relative to a "previous solution" version
// (called the "pivot" here).
CS.VersionPricer.prototype.scanVersionsWithPrevious = function (versions, pivot) {
  var self = this;
  var cats = self.categorizeVersions(versions, pivot);

  var result1 = self.scanVersions(cats.before, CS.VersionPricer.MODE_UPDATE,
                                  { versionAfter: pivot });
  var result2 = self.scanVersions(cats.after, CS.VersionPricer.MODE_GRAVITY);
  var result3 = self.scanVersions(cats.higherMajor,
                                  CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES,
                                  // not actually the version right before, but
                                  // gives the `major` cost the bump it needs
                                  { versionBefore: pivot });

  var incompat = [];
  var i;
  for (i = 0; i < cats.before.length; i++) {
    incompat.push(1);
  }
  for (i = 0; i < cats.after.length; i++) {
    incompat.push(0);
  }
  for (i = 0; i < cats.higherMajor.length; i++) {
    incompat.push(1);
  }

  return [
    incompat,
    result1[0].concat(result2[0], result3[0]),
    result1[1].concat(result2[1], result3[1]),
    result1[2].concat(result2[2], result3[2]),
    result1[3].concat(result2[3], result3[3])
  ];
};
