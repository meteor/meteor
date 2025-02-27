import { Tinytest } from "meteor/tinytest";
import { isModern } from "meteor/modern-browsers";

Tinytest.add('modern-browsers - versions - basic', function (test) {
  test.isTrue(isModern({
    name: "chrome",
    major: 60,
  }));

  test.isTrue(isModern({
    name: "chromeMobile",
    major: 60,
  }));

  test.isTrue(isModern({
    name: "edgeMobile",
    major: 120,
  }));

  test.isFalse(isModern({
    name: "firefox",
    major: 25,
  }));

  test.isTrue(isModern({
    name: "safari",
    major: 10,
    minor: 2,
  }));

  test.isFalse(isModern({
    name: "safari",
    major: 9,
    minor: 5,
    patch: 2,
  }));

  test.isTrue(isModern({
    name: "appleMail", 
    major: 605, 
    minor: 1,
    patch: 15,
  }));

  test.isFalse(isModern({
    name: "unknownBrowser", 
    major: 10, 
    minor: 1,
    patch: 0,
  }));

  const oldPackageSettings = Meteor.settings.packages;
  
  Meteor.settings.packages = {
    "modern-browsers": {
       "unknownBrowsersAssumedModern": true
    }
  };

  test.isTrue(isModern({
    name: "unknownBrowser", 
    major: 10, 
    minor: 1,
    patch: 0,
  }));


  Meteor.settings.packages = oldPackageSettings;
});
