var currentTest = null;

var t = function (versionString, expected, descr) {
  currentTest.equal(
    _.omit(PackageVersion.parseConstraint(versionString),
           'constraintString'),
    expected,
    descr);
};

var FAIL = function (versionString) {
  currentTest.throws(function () {
    PackageVersion.parseConstraint(versionString);
  });
};

Tinytest.add("Smart Package version string parsing - old format", function (test) {
  currentTest = test;

  t("foo", { name: "foo", version: null, type: "compatible-with" });
  t("foo-1234", { name: "foo-1234", version: null, type: "compatible-with" });
  FAIL("my_awesome_InconsitentPackage123");
});

Tinytest.add("Smart Package version string parsing - compatible version, compatible-with", function (test) {
  currentTest = test;

  t("foo@1.2.3", { name: "foo", version: "1.2.3", type: "compatible-with" });
  t("foo-1233@1.2.3", { name: "foo-1233", version: "1.2.3", type: "compatible-with" });
  t("foo-bar@3.2.1", { name: "foo-bar", version: "3.2.1", type: "compatible-with" });
  FAIL("42@0.2.0");
  FAIL("foo@1.2.3.4");
  FAIL("foo@1.4");
  FAIL("foo@1");
  FAIL("foo@");
  FAIL("foo@@");
  FAIL("foo@x.y.z");
  FAIL("foo@<1.2");
  FAIL("foo<1.2");
});

Tinytest.add("Smart Package version string parsing - compatible version, exactly", function (test) {
  currentTest = test;

  t("foo@=1.2.3", { name: "foo", version: "1.2.3", type: "exactly" });
  t("foo-bar@=3.2.1", { name: "foo-bar", version: "3.2.1", type: "exactly" });
  FAIL("42@=0.2.0");
  FAIL("foo@=1.2.3.4");
  FAIL("foo@=1.4");
  FAIL("foo@=1");
  FAIL("foo@@=");
  FAIL("foo@=@");
  FAIL("foo@=x.y.z");
  FAIL("foo@=<1.2");
  FAIL("foo@<=1.2");
  FAIL("foo<=1.2");
});

Tinytest.add("Smart Package version string parsing - compatible version, at-least", function (test) {
  var t = function (versionString, expected, descr) {
    test.equal(
      _.omit(PackageVersion.parseConstraint(versionString,
                                            {allowAtLeast: true}),
             'constraintString'),
      expected,
      descr);
    test.throws(function () {
      PackageVersion.parseConstraint(versionString);
    });
  };

  var FAIL = function (versionString) {
    test.throws(function () {
      PackageVersion.parseConstraint(versionString, {allowAtLeast: true});
    });
    test.throws(function () {
      PackageVersion.parseConstraint(versionString);
    });
  };

  t("foo@>=1.2.3", { name: "foo", version: "1.2.3", type: "at-least" });
  t("foo-bar@>=3.2.1", { name: "foo-bar", version: "3.2.1", type: "at-least" });
  FAIL("42@>=0.2.0");
  FAIL("foo@>=1.2.3.4");
  FAIL("foo@>=1.4");
  FAIL("foo@>=1");
  FAIL("foo@@>=");
  FAIL("foo@>=@");
  FAIL("foo@>=x.y.z");
  FAIL("foo@=>12.3.11");
});

