var _ = require('underscore');
var utils = require('../utils.js');
var selftest = require('../selftest.js');

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

selftest.define("version parsing - compatible version", function () {
  testVersions([
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
  ]);
});

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
