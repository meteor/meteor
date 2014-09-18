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
  FAIL("foo@1.2.3~abc");
  FAIL("foo@1.2.3+1234~1");
  FAIL("foo@1.2.3~1-rc1");
  FAIL("foo-1233@1.2.3~0");
  FAIL("foo-1233@1.2.3~");
  FAIL("foo-1233@1.2.3~0123");

  t("foo@1.2.3~1", { name: "foo", constraints: [{
       version: "1.2.3~1", type: "compatible-with" } ]});
  t("foo-bar@3.2.1-rc0~123", { name: "foo-bar", constraints: [{
       version: "3.2.1-rc0~123", type: "compatible-with" } ]});
  t("foo-1233@1.2.3~5+1234", { name: "foo-1233", constraints: [{
       version: "1.2.3~5+1234", type: "compatible-with" } ]});
  t("foo", { name: "foo", constraints: [{
       version: null, type: "any-reasonable" } ]});
});

Tinytest.add("Smart Package version string parsing - compatible version, exactly", function (test) {
  currentTest = test;

  t("foo@=1.2.3", { name: "foo", constraints: [
         { version: "1.2.3", type: "exactly" } ]});
  t("foo-bar@=3.2.1", { name: "foo-bar", constraints: [{
      version: "3.2.1", type: "exactly" } ]});
  t("foo@=1.2.3~1", { name: "foo", constraints: [{
       version: "1.2.3~1", type: "exactly" } ]});
  t("foo-bar@=3.2.1~34", { name: "foo-bar", constraints: [{
       version: "3.2.1~34", type: "exactly" } ]});

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


Tinytest.add("Smart Package version string parsing - or", function (test) {
  currentTest = test;

  t("foo@1.0.0 || 2.0.0 || 3.0.0 || =4.0.0-rc1",
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
  t("foo@=1.2.3~1 || 1.2.4",
    { name: "foo", constraints:
      [{ version: "1.2.3~1", type: "exactly"},
       { version: "1.2.4", type: "compatible-with"}]
   });
  t("foo-bar@=3.2.1~34 || =3.2.1-rc1",
    { name: "foo-bar", constraints:
      [{ version: "3.2.1~34", type: "exactly"},
       { version: "3.2.1-rc1", type: "exactly"}]
    });

  FAIL("foo@1.0.0 1.0.0");
  FAIL("foo@1.0.0||1.0.0");
  FAIL("foo@1.0.0 | 1.0.0");
  FAIL("foo || bar");
  FAIL("foo@1.0.0-rc|1.0.0");
});

Tinytest.add("Meteor Version string parsing - less than", function (test) {
  test.isTrue(PackageVersion.lessThan("1.0.0", "1.2.0"));
  test.isTrue(PackageVersion.lessThan("1.0.0~500", "1.2.0"));
  test.isTrue(PackageVersion.lessThan("1.0.0~1", "1.0.0~2"));
  test.isTrue(PackageVersion.lessThan("1.0.0", "1.0.0~2"));
  test.isTrue(PackageVersion.lessThan("1.123.0~123", "3.0.0~2"));

  test.isFalse(PackageVersion.lessThan("1.0.0~5", "1.0.0~2"));
  test.isFalse(PackageVersion.lessThan("1.0.0", "1.0.0"));
  test.isFalse(PackageVersion.lessThan("1.0.0~5", "1.0.0~5"));
  test.isFalse(PackageVersion.lessThan("1.0.1", "1.0.0~5"));
});

Tinytest.add("Meteor Version string parsing - compare", function (test) {
  test.isTrue(PackageVersion.compare("1.0.0", "1.2.0") < 0);
  test.isTrue(PackageVersion.compare("1.0.0~500", "1.2.0") < 0);
  test.isTrue(PackageVersion.compare("1.0.0~1", "1.0.0~2") < 0);
  test.isTrue(PackageVersion.compare("1.0.0", "1.0.0~2") < 0);
  test.isTrue(PackageVersion.compare("1.123.0~123", "3.0.0~2") < 0);

  test.isTrue(PackageVersion.compare("1.0.0~5", "1.0.0~2") > 0);
  test.equal(PackageVersion.compare("1.0.0", "1.0.0"), 0);
  test.equal(PackageVersion.compare("1.0.0~1", "1.0.0~1"), 0);
  test.isTrue(PackageVersion.compare("1.2.0", "1.0.0") > 0);
  test.isTrue(PackageVersion.compare("1.0.1", "1.0.0~5") > 0);
});
