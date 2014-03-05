var currentTest = null;

var t = function (versionString, expected, descr) {
  currentTest.equal(PackageVersion.parse(versionString), expected, descr);
};

var FAIL = function (versionString) {
  currentTest.throws(function () {
    PackageVersion.parse(versionString);
  });
};

Tinytest.add("Smart Package version string parsing - old format", function (test) {
  currentTest = test;

  t("foo", { name: "foo", version: null, sticky: false });
  t("foo-1234", { name: "foo-1234", version: null, sticky: false });
  FAIL("my_awesome_InconsitentPackage123");
});

Tinytest.add("Smart Package version string parsing - compatible version", function (test) {
  currentTest = test;

  t("foo@1.2.3", { name: "foo", version: "1.2.3", sticky: false });
  t("foo-1233@1.2.3", { name: "foo-1233", version: "1.2.3", sticky: false });
  t("foo-bar@3.2.1", { name: "foo-bar", version: "3.2.1", sticky: false });
  t("42@0.2.0", { name: "42", version: "0.2.0", sticky: false });
  FAIL("foo@1.2.3.4");
  FAIL("foo@1.4");
  FAIL("foo@1");
  FAIL("foo@");
  FAIL("foo@@");
  FAIL("foo@x.y.z");
  FAIL("foo@<1.2");
  FAIL("foo<1.2");
});

Tinytest.add("Smart Package version string parsing - compatible version sticky", function (test) {
  currentTest = test;

  t("foo@=1.2.3", { name: "foo", version: "1.2.3", sticky: true });
  t("foo-bar@=3.2.1", { name: "foo-bar", version: "3.2.1", sticky: true });
  t("42@=0.2.0", { name: "42", version: "0.2.0", sticky: true });
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

