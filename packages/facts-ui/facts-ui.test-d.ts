import { expectTypeOf } from "expect-type";
import { Facts } from "meteor/facts-base";

// facts-ui contributes `Facts.server` onto the facts-base namespace.
expectTypeOf(Facts.server).toBeObject();
