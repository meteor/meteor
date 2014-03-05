var currentTest = null;

var t = function (versionString, expected, descr) {
  currentTest.equal(PackageVersion.parseConstraint(versionString), expected, descr);
};

var FAIL = function (versionString) {
  currentTest.throws(function () {
    PackageVersion.parseConstraint(versionString);
  });
};

Tinytest.add("Smart Package version string parsing - old format", function (test) {
  currentTest = test;

  t("foo", { name: "foo", version: null, exact: false });
  t("foo-1234", { name: "foo-1234", version: null, exact: false });
  FAIL("my_awesome_InconsitentPackage123");
});

Tinytest.add("Smart Package version string parsing - compatible version", function (test) {
  currentTest = test;

  t("foo@1.2.3", { name: "foo", version: "1.2.3", exact: false });
  t("foo-1233@1.2.3", { name: "foo-1233", version: "1.2.3", exact: false });
  t("foo-bar@3.2.1", { name: "foo-bar", version: "3.2.1", exact: false });
  t("42@0.2.0", { name: "42", version: "0.2.0", exact: false });
  FAIL("foo@1.2.3.4");
  FAIL("foo@1.4");
  FAIL("foo@1");
  FAIL("foo@");
  FAIL("foo@@");
  FAIL("foo@x.y.z");
  FAIL("foo@<1.2");
  FAIL("foo<1.2");
});

Tinytest.add("Smart Package version string parsing - compatible version exact", function (test) {
  currentTest = test;

  t("foo@=1.2.3", { name: "foo", version: "1.2.3", exact: true });
  t("foo-bar@=3.2.1", { name: "foo-bar", version: "3.2.1", exact: true });
  t("42@=0.2.0", { name: "42", version: "0.2.0", exact: true });
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

