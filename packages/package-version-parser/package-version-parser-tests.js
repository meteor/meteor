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

  t("foo", { name: "foo", version: null, type: "any-reasonable" });
  t("foo-1234", { name: "foo-1234", version: null, type: "any-reasonable" });
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
  FAIL("foo@1.2.3~abc");
  FAIL("foo@1.2.3~1+1234");
  FAIL("foo@1.2.3~1-rc1");

  t("foo@1.2.3~1", { name: "foo", version: "1.2.3~1", type: "compatible-with" });
  t("foo-1233@1.2.3~0", { name: "foo-1233", version: "1.2.3~0", type: "compatible-with" });
  t("foo-bar@3.2.1-rc0~123", { name: "foo-bar", version: "3.2.1-rc0~123", type: "compatible-with" });
  t("foo-1233@1.2.3+1234~0", { name: "foo-1233", version: "1.2.3+1234~0", type: "compatible-with" });
  t("foo", { name: "foo", version: null, type: "any-reasonable" });
});

Tinytest.add("Smart Package version string parsing - compatible version, exactly", function (test) {
  currentTest = test;

  t("foo@=1.2.3", { name: "foo", version: "1.2.3", type: "exactly" });
  t("foo-bar@=3.2.1", { name: "foo-bar", version: "3.2.1", type: "exactly" });
  t("foo@=1.2.3~1", { name: "foo", version: "1.2.3~1", type: "exactly" });
  t("foo-bar@=3.2.1~34", { name: "foo-bar", version: "3.2.1~34", type: "exactly" });

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
  FAIL("foo@=1.2.3~rc0");

  // We no longer support @>=.
  FAIL("foo@>=1.2.3");
  FAIL("foo-bar@>=3.2.1");
  FAIL("42@>=0.2.0");
  FAIL("foo@>=1.2.3.4");
  FAIL("foo@>=1.4");
  FAIL("foo@>=1");
  FAIL("foo@@>=");
  FAIL("foo@>=@");
  FAIL("foo@>=x.y.z");
  FAIL("foo@=>12.3.11");
});

Tinytest.add("Meteor Version string parsing - less than", function (test) {
  test.equal(PackageVersion.lessThan("1.0.0", "1.2.0"), true);
  test.equal(PackageVersion.lessThan("1.0.0~500", "1.2.0"), true);
  test.equal(PackageVersion.lessThan("1.0.0~1", "1.0.0~2"), true);
  test.equal(PackageVersion.lessThan("1.0.0", "1.0.0~2"), true);
  test.equal(PackageVersion.lessThan("1.123.0~123", "3.0.0~2"), true);

  test.equal(PackageVersion.lessThan("1.0.0~5", "1.0.0~2"), false);
  test.equal(PackageVersion.lessThan("1.0.0", "1.0.0"), false);
  test.equal(PackageVersion.lessThan("1.0.0~5", "1.0.0~5"), false);
  test.equal(PackageVersion.lessThan("1.0.1", "1.0.0~5"), false);
});

Tinytest.add("Meteor Version string parsing - compare", function (test) {
  test.equal(PackageVersion.compare("1.0.0", "1.2.0"), -1);
  test.equal(PackageVersion.compare("1.0.0~500", "1.2.0"), -1);
  test.equal(PackageVersion.compare("1.0.0~1", "1.0.0~2"), -1);
  test.equal(PackageVersion.compare("1.0.0", "1.0.0~2"), -1);
  test.equal(PackageVersion.compare("1.123.0~123", "3.0.0~2"), -1);

  test.equal(PackageVersion.compare("1.0.0~5", "1.0.0~2"), 1);
  test.equal(PackageVersion.compare("1.0.0", "1.0.0"), 0);
  test.equal(PackageVersion.compare("1.0.0", "1.0.0~0"), 0);
  test.equal(PackageVersion.compare("1.0.0~1", "1.0.0~1"), 0);
  test.equal(PackageVersion.compare("1.2.0", "1.0.0"), 1);
  test.equal(PackageVersion.compare("1.0.1", "1.0.0~5"), 1);
});
