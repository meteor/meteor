import { Tinytest } from "meteor/tinytest";

Tinytest.add("coffeescript - bare", function (test) {
  test.equal(VariableSetByCoffeeBareTestSetup, 5678);
});
