

var TEST_METADATA_STR;
if (Meteor.isClient) {
  TEST_METADATA_STR = meteorEnv.TEST_METADATA;
} else {
  TEST_METADATA_STR = process.env.TEST_METADATA;
}

var TEST_METADATA = JSON.parse(TEST_METADATA_STR || "{}");
var testDriverPackageName = TEST_METADATA.driverPackage;

// Note that if we are in test-packages mode neither of these will be set,
// but we will have a test driver package
/** 
 *@memberof Meteor
 * @summary Boolean variable. True when running unit tests (false if running
 * tests in full app mode).
 * @locus Anywhere
 * @static
 * @type {Boolean}
 */
Meteor.isTest = !!TEST_METADATA.isTest;

/** 
 *@memberof Meteor
 * @summary Boolean variable.  True if running tests against your application i.e `meteor test --full-app`.
 * @locus Anywhere
 * @static
 * @type {Boolean}
 */
Meteor.isAppTest = !!TEST_METADATA.isAppTest;

/** 
 *@memberof Meteor
 * @summary Boolean variable.  True if running tests against a Meteor package.
 * @locus Anywhere
 * @static
 * @type {Boolean}
 */
Meteor.isPackageTest = !!testDriverPackageName && !Meteor.isTest && !Meteor.isAppTest; 

if (typeof testDriverPackageName === "string") {
  Meteor.startup(function() {
    var testDriverPackage = Package[testDriverPackageName];
    if (! testDriverPackage) {
      throw new Error("Can't find test driver package: " + testDriverPackageName);
    }

    // On the client, the test driver *must* define `runTests`
    if (Meteor.isClient) {
      if (typeof testDriverPackage.runTests !== "function") {
        throw new Error("Test driver package " + testDriverPackageName
          + " missing `runTests` export");
      }
      testDriverPackage.runTests();
    } else {
      // The server can optionally define `start`
      if (typeof testDriverPackage.start === "function") {
        testDriverPackage.start();
      }
    }
  });
}
