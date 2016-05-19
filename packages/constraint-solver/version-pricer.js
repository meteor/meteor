var CS = ConstraintSolver;
var PV = PackageVersion;

CS.VersionPricer = function () {
  var self = this;

  // self.getVersionInfo(versionString) returns an object
  // that contains at least { major, minor, patch }.
  //
  // The VersionPricer instance stores a memoization table for
  // efficiency.
  self.getVersionInfo = _.memoize(PV.parse);
};

CS.VersionPricer.MODE_UPDATE = 1;
CS.VersionPricer.MODE_GRAVITY = 2;
CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES = 3;

// priceVersions(versions, mode, options) calculates small integer
// costs for each version, based on whether each part of the version
// is low or high relative to the other versions with the same higher
// parts.
//
// For example, if "1.2.0" and "1.2.1" are the only 1.2.x versions
// in the versions array, they will be assigned PATCH costs of
// 1 and 0 in UPDATE mode (penalizing the older version), or 0 and 1
// in GRAVITY mode (penalizing the newer version).  When optimizing,
// the solver will prioritizing minimizing MAJOR costs, then MINOR
// costs, then PATCH costs, and then "REST" costs (which penalizing
// being old or new within versions that have the same major, minor,
// AND patch).
//
// - `versions` - Array of version strings in sorted order
// - `mode` - A MODE constant
// - `options`:
//   - `versionAfter` - if provided, the next newer version not in the
//     array but that would come next.
//   - `versionBefore` - if provided, the next older version not in the
//     the array but that would come before it.
//
// Returns: an array of 4 arrays, each of length versions.length,
// containing the MAJOR, MINOR, PATCH, and REST costs corresponding
// to the versions.
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
// The easiest way to implement this function would be to partition
// `versions` into subarrays of versions with the same major part,
// and then partition those arrays based on the minor parts, and
// so on.  However, that's a lot of array allocations -- O(N) or
// thereabouts.  So instead we use a linear scan backwards through
// the versions array.
CS.VersionPricer.prototype.priceVersions = function (versions, mode, options) {
  var self = this;

  var getMajorMinorPatch = function (v) {
    var vInfo = self.getVersionInfo(v);
    return [vInfo.major, vInfo.minor, vInfo.patch];
  };

  var MAJOR = 0, MINOR = 1, PATCH = 2, REST = 3;
  var gravity; // array of MAJOR, MINOR, PATCH, REST

  switch (mode) {
  case CS.VersionPricer.MODE_UPDATE:
    gravity = [false, false, false, false];
    break;
  case CS.VersionPricer.MODE_GRAVITY:
    gravity = [true, true, true, true];
    break;
  case CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES:
    gravity = [true, true, false, false];
    break;
  default:
    throw new Error("Bad mode: " + mode);
  }

  var lastMajorMinorPatch = null;
  if (options && options.versionAfter) {
    lastMajorMinorPatch = getMajorMinorPatch(options.versionAfter);
  }
  // `costs` contains arrays of whole numbers, each of which will
  // have a length of versions.length.  This is what we will return.
  var costs = [[], [], [], []]; // MAJOR, MINOR, PATCH, REST
  // How many in a row of the same MAJOR, MINOR, or PATCH have we seen?
  var countOfSame = [0, 0, 0];

  // Track how old each part of versions[i] is, in terms of how many
  // greater values there are for that part among versions with the
  // same higher parts.  For example, oldness[REST] counts the number
  // of versions after versions[i] with the same MAJOR, MINOR, and REST.
  // oldness[PATCH] counts the number of *different* higher values for
  // for PATCH among later versions with the same MAJOR and MINOR parts.
  var oldness = [0, 0, 0, 0];

  // Walk the array backwards
  for (var i = versions.length - 1; i >= 0; i--) {
    var v = versions[i];
    var majorMinorPatch = getMajorMinorPatch(v);
    if (lastMajorMinorPatch) {
      for (var k = MAJOR; k <= REST; k++) {
        if (k === REST || majorMinorPatch[k] !== lastMajorMinorPatch[k]) {
          // For the highest part that changed, bumped the oldness
          // and clear the lower oldnesses.
          oldness[k]++;
          for (var m = k+1; m <= REST; m++) {
            if (gravity[m]) {
              // if we should actually be counting "newness" instead of
              // oldness, flip the count.  Instead of [0, 1, 1, 2, 3],
              // for example, make it [3, 2, 2, 1, 0].  This is the place
              // to do it, because we have just "closed out" a run.
              flipLastN(costs[m], countOfSame[m-1], oldness[m]);
            }
            countOfSame[m-1] = 0;
            oldness[m] = 0;
          }
          break;
        }
      }
    }
    for (var k = MAJOR; k <= REST; k++) {
      costs[k].push(oldness[k]);
      if (k !== REST) {
        countOfSame[k]++;
      }
    }
    lastMajorMinorPatch = majorMinorPatch;
  }
  if (options && options.versionBefore && versions.length) {
    // bump the appropriate value of oldness, as if we ran the loop
    // one more time
    majorMinorPatch = getMajorMinorPatch(options.versionBefore);
    for (var k = MAJOR; k <= REST; k++) {
      if (k === REST || majorMinorPatch[k] !== lastMajorMinorPatch[k]) {
        oldness[k]++;
        break;
      }
    }
  }

  // Flip the MAJOR costs if we have MAJOR gravity -- subtracting them
  // all from oldness[MAJOR] -- and likewise for other parts if countOfSame
  // is > 0 for the next highest part (meaning we didn't get a chance to
  // flip some of the costs because the loop ended).
  for (var k = MAJOR; k <= REST; k++) {
    if (gravity[k]) {
      flipLastN(costs[k], k === MAJOR ? costs[k].length : countOfSame[k-1],
                oldness[k]);
    }
  }

  // We pushed costs onto the arrays in reverse order.  Reverse the cost
  // arrays in place before returning them.
  return [costs[MAJOR].reverse(),
          costs[MINOR].reverse(),
          costs[PATCH].reverse(),
          costs[REST].reverse()];
};

// "Flip" the last N elements of array in place by subtracting each
// one from `max`.  For example, if `a` is `[3,0,1,1,2]`, then calling
// `flipLastN(a, 4, 2)` mutates `a` into `[3,2,1,1,0]`.
var flipLastN = function (array, N, max) {
  var len = array.length;
  for (var i = 0; i < N; i++) {
    var j = len - 1 - i;
    array[j] = max - array[j];
  }
};

// Partition a sorted array of versions into three arrays, containing
// the versions that are `older` than the `target` version,
// `compatible` with it, or have a `higherMajor` version.
//
// For example, `["1.0.0", "2.5.0", "2.6.1", "3.0.0"]` with a target of
// `"2.5.0"` returns `{ older: ["1.0.0"], compatible: ["2.5.0", "2.6.1"],
// higherMajor: ["3.0.0"] }`.
CS.VersionPricer.prototype.partitionVersions = function (versions, target) {
  var self = this;
  var firstGteIndex = versions.length;
  var higherMajorIndex = versions.length;
  var targetVInfo = self.getVersionInfo(target);
  for (var i = 0; i < versions.length; i++) {
    var v = versions[i];
    var vInfo = self.getVersionInfo(v);
    if (firstGteIndex === versions.length &&
        ! PV.lessThan(vInfo, targetVInfo)) {
      firstGteIndex = i;
    }
    if (vInfo.major > targetVInfo.major) {
      higherMajorIndex = i;
      break;
    }
  }
  return { older: versions.slice(0, firstGteIndex),
           compatible: versions.slice(firstGteIndex, higherMajorIndex),
           higherMajor: versions.slice(higherMajorIndex) };
};

// Use a combination of calls to priceVersions with different modes in order
// to generate costs for versions relative to a "previous solution" version
// (called the "target" here).
CS.VersionPricer.prototype.priceVersionsWithPrevious = function (
  versions, target, takePatches) {

  var self = this;
  var parts = self.partitionVersions(versions, target);

  var result1 = self.priceVersions(parts.older, CS.VersionPricer.MODE_UPDATE,
                                   { versionAfter: target });
  // Usually, it's better to remain as close as possible to the target
  // version, but prefer higher patch versions (and wrapNums, etc.) if
  // we were passed `takePatches`.
  var result2 = self.priceVersions(parts.compatible,
                                   (takePatches ?
                                    CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES :
                                    CS.VersionPricer.MODE_GRAVITY));
  // If we're already bumping the major version, might as well take patches.
  var result3 = self.priceVersions(parts.higherMajor,
                                   CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES,
                                   // not actually the version right before, but
                                   // gives the `major` cost the bump it needs
                                   { versionBefore: target });

  // Generate a fifth array, incompat, which has a 1 for each incompatible
  // version and a 0 for each compatible version.
  var incompat = [];
  var i;
  for (i = 0; i < parts.older.length; i++) {
    incompat.push(1);
  }
  for (i = 0; i < parts.compatible.length; i++) {
    incompat.push(0);
  }
  for (i = 0; i < parts.higherMajor.length; i++) {
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
