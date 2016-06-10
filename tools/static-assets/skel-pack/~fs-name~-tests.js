// Import Tinytest from the tinytest Meteor package.
import { Tinytest } from "meteor/tinytest";

// Import and rename a variable exported by ~fs-name~.js.
import { name as packageName } from "meteor/~name~";

// Write your tests here!
// Here is an example.
Tinytest.add('~fs-name~ - example', function (test) {
  test.equal(packageName, "~fs-name~");
});
