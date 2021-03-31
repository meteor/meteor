import { Tinytest } from "meteor/tinytest";
import { Slot } from "meteor/context";

Tinytest.add('context - basic Slot usage', function (test) {
  const slot = new Slot();
  test.equal(slot.hasValue(), false);
  slot.withValue(123, () => {
    test.equal(slot.hasValue(), true);
    test.equal(slot.getValue(), 123);
  });
  test.equal(slot.hasValue(), false);
});
