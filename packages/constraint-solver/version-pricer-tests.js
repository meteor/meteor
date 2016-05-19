var CS = ConstraintSolver;
var PV = PackageVersion;


Tinytest.add("constraint solver - version pricer", function (test) {

  var pricer = new CS.VersionPricer();

  var testScanVersions = function (versions, mode, options, expected) {
    if (options && _.isArray(options)) {
      expected = options;
      options = null;
    }
    var result, tuples;
    // Accepts either a mode like CS.VersionPricer.MODE_UPDATE or
    // an object that looks like `{ previous: version }`
    if (_.isObject(mode) && mode.previous) {
      result = pricer.priceVersionsWithPrevious(versions, mode.previous);
      tuples = _.zip(versions, result[0], result[1], result[2], result[3],
                     result[4]);
    } else {
      result = pricer.priceVersions(versions, mode, options);
      tuples = _.zip(versions, result[0], result[1], result[2], result[3]);
    }
    test.equal(tuples.length, expected.length);
    test.equal(_.pluck(tuples, 0), versions);
    _.each(_.zip(tuples, expected), function (x) {
      var tuple = x[0];
      var expectedTuple = x[1];
      if (typeof expectedTuple[0] !== 'string') {
        test.equal(tuple.slice(1), expectedTuple);
      } else {
        test.equal(tuple, expectedTuple);
      }
    });
  };

  test.equal(pricer.partitionVersions(["1.0.0", "2.5.0", "2.6.1", "3.0.0"],
                                      "2.5.0"),
             { older: ["1.0.0"],
               compatible: ["2.5.0", "2.6.1"],
               higherMajor: ["3.0.0"] });

  test.equal(pricer.priceVersions(["1.0.0", "1.0.1", "2.0.0"],
                                  CS.VersionPricer.MODE_UPDATE),
             [[1, 1, 0], [0, 0, 0], [1, 0, 0], [0, 0, 0]]);

  testScanVersions(["1.0.0", "2.0.0"], CS.VersionPricer.MODE_UPDATE,
                   [["1.0.0",1,0,0,0], // major version behind
                    ["2.0.0",0,0,0,0]]); // latest version

  testScanVersions(["0.0.2", "0.5.0", "7.1.2"], CS.VersionPricer.MODE_UPDATE,
                   [["0.0.2",1,1,0,0], // major and a minor version behind
                    ["0.5.0",1,0,0,0], // major version behind
                    ["7.1.2",0,0,0,0]]); // latest version

  testScanVersions(["0.0.2", "0.5.0", "7.1.2"], CS.VersionPricer.MODE_GRAVITY,
                   [["0.0.2",0,0,0,0], // oldest
                    ["0.5.0",0,1,0,0], // a minor version newer
                    ["7.1.2",1,0,0,0]]); // a major version newer

  testScanVersions(["0.0.1-pre.0", "0.0.1-pre.1", "0.0.1-pre.2"],
                   CS.VersionPricer.MODE_UPDATE,
                   [[0,0,0,2], [0,0,0,1], [0,0,0,0]]);

  testScanVersions(["0.0.1-pre.0", "0.0.1-pre.1", "0.0.1-pre.2"],
                   CS.VersionPricer.MODE_UPDATE, {versionAfter:"3.4.5-pre.7"},
                   [[1,0,0,2], [1,0,0,1], [1,0,0,0]]);

  testScanVersions(["1.0.0", "1.0.1", "1.0.2", "1.0.3",
                    "1.1.0", "1.1.1",
                    "1.2.0-pre.0", "1.2.0", "1.2.1", "1.2.2-pre.0", "1.2.2",
                    "2.0.0", "2.0.1", "2.0.2",
                    "2.1.0",
                    "2.5.0",
                    "2.5.1",
                    "3.0.0",
                    "4.0.0-pre.0", "4.0.0", "4.0.0_1"],
                   CS.VersionPricer.MODE_UPDATE,
                   [["1.0.0", 3, 2, 3, 0],
                    ["1.0.1", 3, 2, 2, 0],
                    ["1.0.2", 3, 2, 1, 0],
                    ["1.0.3", 3, 2, 0, 0],
                    ["1.1.0", 3, 1, 1, 0],
                    ["1.1.1", 3, 1, 0, 0],
                    ["1.2.0-pre.0", 3, 0, 2, 1],
                    ["1.2.0", 3, 0, 2, 0],
                    ["1.2.1", 3, 0, 1, 0],
                    ["1.2.2-pre.0", 3, 0, 0, 1],
                    ["1.2.2", 3, 0, 0, 0],
                    ["2.0.0", 2, 2, 2, 0],
                    ["2.0.1", 2, 2, 1, 0],
                    ["2.0.2", 2, 2, 0, 0],
                    ["2.1.0", 2, 1, 0, 0],
                    ["2.5.0", 2, 0, 1, 0],
                    ["2.5.1", 2, 0, 0, 0],
                    ["3.0.0", 1, 0, 0, 0],
                    ["4.0.0-pre.0", 0, 0, 0, 2],
                    ["4.0.0", 0, 0, 0, 1],
                    ["4.0.0_1", 0, 0, 0, 0]]);

  testScanVersions(["1.0.0", "1.0.1", "1.0.2", "1.0.3",
                    "1.1.0", "1.1.1",
                    "1.2.0-pre.0", "1.2.0", "1.2.1", "1.2.2-pre.0", "1.2.2",
                    "2.0.0", "2.0.1", "2.0.2",
                    "2.1.0",
                    "2.5.0",
                    "2.5.1",
                    "3.0.0",
                    "4.0.0-pre.0", "4.0.0", "4.0.0_1"],
                   CS.VersionPricer.MODE_GRAVITY,
                   [["1.0.0", 0, 0, 0, 0],
                    ["1.0.1", 0, 0, 1, 0],
                    ["1.0.2", 0, 0, 2, 0],
                    ["1.0.3", 0, 0, 3, 0],
                    ["1.1.0", 0, 1, 0, 0],
                    ["1.1.1", 0, 1, 1, 0],
                    ["1.2.0-pre.0", 0, 2, 0, 0],
                    ["1.2.0", 0, 2, 0, 1],
                    ["1.2.1", 0, 2, 1, 0],
                    ["1.2.2-pre.0", 0, 2, 2, 0],
                    ["1.2.2", 0, 2, 2, 1],
                    ["2.0.0", 1, 0, 0, 0],
                    ["2.0.1", 1, 0, 1, 0],
                    ["2.0.2", 1, 0, 2, 0],
                    ["2.1.0", 1, 1, 0, 0],
                    ["2.5.0", 1, 2, 0, 0],
                    ["2.5.1", 1, 2, 1, 0],
                    ["3.0.0", 2, 0, 0, 0],
                    ["4.0.0-pre.0", 3, 0, 0, 0],
                    ["4.0.0", 3, 0, 0, 1],
                    ["4.0.0_1", 3, 0, 0, 2]]);

  testScanVersions(["1.0.0", "1.0.1", "1.0.2", "1.0.3",
                    "1.1.0", "1.1.1",
                    "1.2.0-pre.0", "1.2.0", "1.2.1", "1.2.2-pre.0", "1.2.2",
                    "2.0.0", "2.0.1", "2.0.2",
                    "2.1.0",
                    "2.5.0",
                    "2.5.1",
                    "3.0.0",
                    "4.0.0-pre.0", "4.0.0", "4.0.0_1"],
                   CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES,
                   [["1.0.0", 0, 0, 3, 0],
                    ["1.0.1", 0, 0, 2, 0],
                    ["1.0.2", 0, 0, 1, 0],
                    ["1.0.3", 0, 0, 0, 0],
                    ["1.1.0", 0, 1, 1, 0],
                    ["1.1.1", 0, 1, 0, 0],
                    ["1.2.0-pre.0", 0, 2, 2, 1],
                    ["1.2.0", 0, 2, 2, 0],
                    ["1.2.1", 0, 2, 1, 0],
                    ["1.2.2-pre.0", 0, 2, 0, 1],
                    ["1.2.2", 0, 2, 0, 0],
                    ["2.0.0", 1, 0, 2, 0],
                    ["2.0.1", 1, 0, 1, 0],
                    ["2.0.2", 1, 0, 0, 0],
                    ["2.1.0", 1, 1, 0, 0],
                    ["2.5.0", 1, 2, 1, 0],
                    ["2.5.1", 1, 2, 0, 0],
                    ["3.0.0", 2, 0, 0, 0],
                    ["4.0.0-pre.0", 3, 0, 0, 2],
                    ["4.0.0", 3, 0, 0, 1],
                    ["4.0.0_1", 3, 0, 0, 0]]);


  testScanVersions(["1.0.0", "1.0.1", "1.0.2", "1.0.3",
                    "1.1.0", "1.1.1",
                    "1.2.0-pre.0", "1.2.0", "1.2.1", "1.2.2-pre.0", "1.2.2",
                    "2.0.0", "2.0.1", "2.0.2",
                    "2.1.0",
                    "2.5.0",
                    "2.5.1",
                    "3.0.0",
                    "4.0.0-pre.0", "4.0.0", "4.0.0_1"],
                   { previous: "1.2.0" },
                   // This part is like UPDATE, without the major cost
                   [["1.0.0", 1, 0, 2, 3, 0],
                    ["1.0.1", 1, 0, 2, 2, 0],
                    ["1.0.2", 1, 0, 2, 1, 0],
                    ["1.0.3", 1, 0, 2, 0, 0],
                    ["1.1.0", 1, 0, 1, 1, 0],
                    ["1.1.1", 1, 0, 1, 0, 0],
                    // This part is like UPDATE, without the minor cost
                    ["1.2.0-pre.0", 1, 0, 0, 0, 1],
                    // This part is like GRAVITY, without the major/minor cost
                    ["1.2.0", 0, 0, 0, 0, 0],
                    ["1.2.1", 0, 0, 0, 1, 0],
                    ["1.2.2-pre.0", 0, 0, 0, 2, 0],
                    ["1.2.2", 0, 0, 0, 2, 1],
                    // This part is like GRAVITY_WITH_PATCHES
                    ["2.0.0", 1, 1, 0, 2, 0],
                    ["2.0.1", 1, 1, 0, 1, 0],
                    ["2.0.2", 1, 1, 0, 0, 0],
                    ["2.1.0", 1, 1, 1, 0, 0],
                    ["2.5.0", 1, 1, 2, 1, 0],
                    ["2.5.1", 1, 1, 2, 0, 0],
                    ["3.0.0", 1, 2, 0, 0, 0],
                    ["4.0.0-pre.0", 1, 3, 0, 0, 2],
                    ["4.0.0", 1, 3, 0, 0, 1],
                    ["4.0.0_1", 1, 3, 0, 0, 0]]);

});
