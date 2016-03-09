var TEST_METADATA = process.env.TEST_METADATA || {};

Meteor.isTest = !!TEST_METADATA.isTest;
Meteor.isAppTest = !!TEST_METADATA.isAppTest;


if (Meteor.isClient && (Meteor.isTest || Meteor.isAppTest)) {
  Meteor.startup(function() {
    var testDriverPackage = Package[TEST_METADATA.driverPackage];
    if (!testDriverPackage) {
      throw new Error("Can't find test driver package: " + TEST_METADATA.driverPackage + "}");
    }

    if (!testDriverPackage.runTests) {
      throw new Error("Test driver package " + testDriverPackageName
        + " missing `runTests` export");
    }
    testDriverPackage.runTests();
  });
}
