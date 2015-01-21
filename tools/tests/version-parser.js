var _ = require('underscore');
var utils = require('../utils.js');
var selftest = require('../selftest.js');
/*
var testVersions = function (cases) {
  _.each(cases, function (c) {
    var input = c[0];
    var expectedOutput = c[1];

    if (expectedOutput === null) {
      selftest.expectThrows(function () {
        utils.parseConstraint(input);
      });
    } else {
      var actualOutput = utils.parseConstraint(input);
      selftest.expectEqual(actualOutput, expectedOutput);
    }
  });
};

selftest.define("version parsing - old format", function () {
  testVersions([
    ["foo", { name: "foo", version: null, exact: false }],
    ["foo-1234", { name: "foo-1234", version: null, exact: false }],
    ["my_awesome_InconsitentPackage123", null]
  ]);
});
*/
selftest.define("version parsing - compatible version", function () {
  console.log("XXX: version tests");
/*  testVersions([
    ["foo@1.2.3", { name: "foo", version: "1.2.3", exact: false }],
    ["foo-1233@1.2.3", { name: "foo-1233", version: "1.2.3", exact: false }],
    ["foo-bar@3.2.1", { name: "foo-bar", version: "3.2.1", exact: false }],
    ["42@0.2.0", { name: "42", version: "0.2.0", exact: false }],
    ["foo@1.2.3.4", null],
    ["foo@1.4", null],
    ["foo@1", null],
    ["foo@", null],
    ["foo@@", null],
    ["foo@x.y.z", null],
    ["foo@<1.2", null],
    ["foo<1.2", null]
  ]); */
});
/*
selftest.define("version parsing - compatible version exact", function () {
  testVersions([
    ["foo@=1.2.3", { name: "foo", version: "1.2.3", exact: true }],
    ["foo-bar@=3.2.1", { name: "foo-bar", version: "3.2.1", exact: true }],
    ["42@=0.2.0", { name: "42", version: "0.2.0", exact: true }],
    ["foo@=1.2.3.4", null],
    ["foo@=1.4", null],
    ["foo@=1", null],
    ["foo@@=", null],
    ["foo@=@", null],
    ["foo@=x.y.z", null],
    ["foo@=<1.2", null],
    ["foo@<=1.2", null],
    ["foo<=1.2", null]
  ]);
});

selftest.define("release management - default orderKey", function () {
  var t = function (cases) {
    _.each(cases, function (c) {
      var version = c[0];
      var expectedOrderKey = c[1];
      var actualOrderKey = utils.defaultOrderKeyForReleaseVersion(version);
      selftest.expectEqual(actualOrderKey, expectedOrderKey);
    });
  };

  t([
    ['1', '0001$'],
    ['0', '0000$'],
    ['01', null],
    ['', null],
    ['1.2.3', '0001.0002.0003$'],
    ['42.123', '0042.0123$'],
    ['1234', '1234$'],
    ['12345', null],
    ['123.012', null],
    ['1.2.3-preview', '0001.0002.0003!preview!!!!!!!!$'],
    ['1.2.3.4-AbCdEfG-HiJkLmO', '0001.0002.0003.0004!AbCdEfG-HiJkLmO$'],
    ['1.2.3.4-AbCdEfG-HiJkLmOp', null],
    ['1.2.3.4-AbCdEfG-HiJkLmO0', '0001.0002.0003.0004!AbCdEfG-HiJkLmO0000$'],
    ['1.2.3.4-AbCdEfG-HiJkLmO01', null],
    ['1.2.3.4-AbCdEfG-HiJkLmO12345', null],
    ['1.2.3.4-AbCdEfG-HiJkLmO15', '0001.0002.0003.0004!AbCdEfG-HiJkLmO0015$'],
    ['1.2.3.4-rc2', '0001.0002.0003.0004!rc!!!!!!!!!!!!!0002$'],
    ['1.2.3.4-2rc', null],
    ['1.2.3.4r', null]
  ]);

  var ordered = [
    '1.2',
    '1.2.0',
    '1.2.1',
    '1.2.1.4',
    '1.2.2',
    '1.2.15',
    '1.15.2',
    '1.15.3-preview',
    '1.15.3-preview2',
    '1.15.3-preview15',
    '1.15.3-rc',
    '1.15.3-rc2',
    '1.15.3-rc15',
    '1.15.3-rd15',
    '1.15.3-rda15',
    '1.15.3',
    '2'
  ];

  for (var i = 0; i < ordered.length - 1; ++i) {
    var first = utils.defaultOrderKeyForReleaseVersion(ordered[i]);
    var next = utils.defaultOrderKeyForReleaseVersion(ordered[i + 1]);
    selftest.expectEqual(first !== null, true);
    selftest.expectEqual(next !== null, true);
    selftest.expectEqual(first < next, true);
  }
});
*/
