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

  t("foo", { name: "foo", constraints: [{
        version: null, type: "any-reasonable" } ]});
  t("foo-1234", { name: "foo-1234", constraints: [{
        version: null, type: "any-reasonable" } ]});
  FAIL("my_awesome_InconsitentPackage123");
});

Tinytest.add("Smart Package version string parsing - compatible version, compatible-with", function (test) {
  currentTest = test;

  t("foo@1.2.3", { name: "foo", constraints: [{
        version: "1.2.3", type: "compatible-with" } ]});
  t("foo-1233@1.2.3", { name: "foo-1233", constraints: [{
        version: "1.2.3", type: "compatible-with" } ]});
  t("foo-bar@3.2.1", { name: "foo-bar", constraints: [{
        version: "3.2.1", type: "compatible-with" } ]});
  FAIL("42@0.2.0");
  FAIL("foo@1.2.3.4");
  FAIL("foo@1.4");
  FAIL("foo@1");
  FAIL("foo@");
  FAIL("foo@@");
  FAIL("foo@x.y.z");
  FAIL("foo@<1.2");
  FAIL("foo<1.2");
  FAIL("foo@1.2.3_abc");
  FAIL("foo@1.2.3+1234_1");
  FAIL("foo@1.2.3_1-rc1");
  FAIL("foo-1233@1.2.3_0");
  FAIL("foo-1233@1.2.3_");
  FAIL("foo-1233@1.2.3_0123");

  t("foo@1.2.3_1", { name: "foo", constraints: [{
       version: "1.2.3_1", type: "compatible-with" } ]});
  t("foo-bar@3.2.1-rc0_123", { name: "foo-bar", constraints: [{
       version: "3.2.1-rc0_123", type: "compatible-with" } ]});
  t("foo-1233@1.2.3_5+1234", { name: "foo-1233", constraints: [{
       version: "1.2.3_5+1234", type: "compatible-with" } ]});
  t("foo", { name: "foo", constraints: [{
       version: null, type: "any-reasonable" } ]});
});

Tinytest.add("Smart Package version string parsing - compatible version, exactly", function (test) {
  currentTest = test;

  t("foo@=1.2.3", { name: "foo", constraints: [
         { version: "1.2.3", type: "exactly" } ]});
  t("foo-bar@=3.2.1", { name: "foo-bar", constraints: [{
      version: "3.2.1", type: "exactly" } ]});
  t("foo@=1.2.3_1", { name: "foo", constraints: [{
       version: "1.2.3_1", type: "exactly" } ]});
  t("foo-bar@=3.2.1_34", { name: "foo-bar", constraints: [{
       version: "3.2.1_34", type: "exactly" } ]});

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
  FAIL("foo@=1.2.3_rc0");

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


Tinytest.add("Smart Package version string parsing - or", function (test) {
  currentTest = test;

  t("foo@1.0.0 || 2.0.0 || 3.0.0 || =4.0.0-rc1",
    { name: "foo", constraints:
      [{ version: "1.0.0", type: "compatible-with"},
       { version: "2.0.0", type: "compatible-with"},
       { version: "3.0.0", type: "compatible-with"},
       { version: "4.0.0-rc1", type: "exactly"}]
   });
  t("foo@1.0.0|| 2.0.0||3.0.0    ||     =4.0.0-rc1",
    { name: "foo", constraints:
      [{ version: "1.0.0", type: "compatible-with"},
       { version: "2.0.0", type: "compatible-with"},
       { version: "3.0.0", type: "compatible-with"},
       { version: "4.0.0-rc1", type: "exactly"}]
   });
  t("foo-bar@=3.2.1 || 1.0.0",
    { name: "foo-bar", constraints:
      [{ version: "3.2.1", type: "exactly"},
       { version: "1.0.0", type: "compatible-with"}]
   });
  t("foo@=1.2.3_1 || 1.2.4",
    { name: "foo", constraints:
      [{ version: "1.2.3_1", type: "exactly"},
       { version: "1.2.4", type: "compatible-with"}]
   });
  t("foo-bar@=3.2.1_34 || =3.2.1-rc1",
    { name: "foo-bar", constraints:
      [{ version: "3.2.1_34", type: "exactly"},
       { version: "3.2.1-rc1", type: "exactly"}]
    });

  FAIL("foo@1.0.0 1.0.0");
  FAIL("foo@1.0.0 | 1.0.0");
  FAIL("foo || bar");
  FAIL("foo@1.0.0-rc|1.0.0");

  // This is the current implementation, but is arguably not great.
  FAIL("foo@1.0.0 ");
});

Tinytest.add(
  "Meteor Version string parsing - less than, compare, version magnitude",
  function (test) {
    var compare = function (v1, v2, expected) {
      if (expected === '<') {
        test.isTrue(PackageVersion.lessThan(v1, v2));
        test.isTrue(PackageVersion.versionMagnitude(v1) < PackageVersion.versionMagnitude(v2));
        test.isTrue(PackageVersion.compare(v1, v2) < 0);
      } else if (expected === '=') {
        test.isFalse(PackageVersion.lessThan(v1, v2));
        test.isFalse(PackageVersion.lessThan(v2, v1));
        test.isTrue(PackageVersion.versionMagnitude(v1) === PackageVersion.versionMagnitude(v2));
        test.isTrue(PackageVersion.compare(v1, v2) === 0);
      } else if (expected === '>') {
        test.isTrue(PackageVersion.lessThan(v2, v1));
        test.isTrue(PackageVersion.versionMagnitude(v1) > PackageVersion.versionMagnitude(v2));
        test.isTrue(PackageVersion.compare(v1, v2) > 0);
      } else {
        throw new Error("expected should be '<', '=' or '>'");
      }
    };

    compare("1.0.0", "1.2.0", "<");
    compare("1.0.0_50", "1.0.1", "<");
    compare("1.0.0_50", "1.2.0", "<");
    compare("1.0.0_1", "1.0.0_2", "<");
    compare("1.0.0_2", "1.0.0_10", "<"); // verify that we compare _N "wrap numbers" as numbers, not strings
    compare("1.0.0", "1.0.0_2", "<");
    compare("1.99.0_99", "3.0.0_2", "<");
    compare("1.99.0", "2.0.0", "<");
    compare("1.0.0_5", "1.0.0_2", ">");
    compare("1.0.0_99", "1.2.0", "<");
    compare("1.0.0_99", "1.0.1", "<");
    compare("1.0.0_1", "1.0.0_2", "<");
    compare("1.0.0", "1.0.0_2", "<");
    compare("1.99.0_99", "3.0.0_2", "<");

    compare("1.0.0_5", "1.0.0_2", ">");
    compare("1.0.0", "1.0.0", "=");
    compare("1.0.0_5", "1.0.0_5", "=");
    compare("1.2.0", "1.0.0", ">");
    compare("1.0.1", "1.0.0_5", ">");

    // Rule 11 from http://semver.org
    compare("0.99.99", "1.0.0-alpha.1", "<");
    compare("1.0.0-alpha", "1.0.0-alpha.1", "<");
    compare("1.0.0-alpha.1", "1.0.0-alpha.beta", "<");
    compare("1.0.0-alpha.beta", "1.0.0-beta", "<");
    compare("1.0.0-beta", "1.0.0-beta.2", "<");
    compare("1.0.0-beta.2", "1.0.0-beta.11", "<");
    compare("1.0.0-beta.11", "1.0.0-rc.1", "<");
    compare("1.0.0-rc.1", "1.0.0", "<");

    // dashes are allowed in prerelease parts
    compare("1.0.0--alpha", "1.0.0-alpha", "<");
    compare("1.0.0-a-lpha", "1.0.0-alpha", "<");
    // test single character prerelease parts
    compare("1.0.0-r.1", "1.0.0", "<");
    // test the edges of `versionMagnitude`
    compare("1.0.0-zzzzzzzzzzzz", "1.0.0", "<");

    // Our broken implementation of Rule 11 (see [*] above the
    // declaration of PackageVersion.versionMagnitude). Maybe one day
    // we'll fix it, in which case replace "===" with ">"
    test.isTrue(PackageVersion.versionMagnitude("1.0.0-beta.0") ===
                PackageVersion.versionMagnitude("1.0.0-bear.0"));

  });

Tinytest.add("Invalid in 0.9.2", function (test) {
  // Note that invalidFirstFormatConstraint assumes that the initial version
  // passed in has been previously checked to be valid in 0.9.3.

  // These are invalid in 0.9.2, but valid in 0.9.3 and above.
  var invalidVersions =
    ["1.0.0_1", "1.0.0 || 2.0.0", "1.0.0-rc1_1",
     "3.4.0-rc1 || =1.0.0"];
  _.each(invalidVersions, function (v) {
    test.isTrue(PackageVersion.invalidFirstFormatConstraint(v));
  });

  // These are all valid in 0.9.2.
  var validVersions =
    ["1.0.0", "2.0.0-rc1", "=2.5.0"];
  _.each(validVersions, function (v) {
    test.isFalse(PackageVersion.invalidFirstFormatConstraint(v));
  });
});
