var TEST_METADATA_STR;
if (Meteor.isClient) {
  TEST_METADATA_STR = meteorEnv.TEST_METADATA;
} else {
  TEST_METADATA_STR = process.env.TEST_METADATA;
}

var TEST_METADATA = JSON.parse(TEST_METADATA_STR || "{}");

Meteor.isTest = !!TEST_METADATA.isTest;
Meteor.isAppTest = !!TEST_METADATA.isAppTest;


if (Meteor.isClient && (Meteor.isTest || Meteor.isAppTest)) {
  Meteor.startup(function() {
    var testDriverPackageName = TEST_METADATA.driverPackage;
    if (typeof testDriverPackageName !== "string") {
      throw new Error("No --driver-package specified for `meteor test`");
    }

    var testDriverPackage = Package[testDriverPackageName];
    if (! testDriverPackage) {
      throw new Error("Can't find test driver package: " + testDriverPackageName);
    }

    if (typeof testDriverPackage.runTests !== "function") {
      throw new Error("Test driver package " + testDriverPackageName
        + " missing `runTests` export");
    }

    testDriverPackage.runTests();
  });
}
