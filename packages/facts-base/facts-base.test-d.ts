import { expectTypeOf } from "expect-type";
import { Facts, FACTS_COLLECTION, FACTS_PUBLICATION } from "./facts-base";

expectTypeOf(FACTS_COLLECTION).toBeString();
expectTypeOf(FACTS_PUBLICATION).toBeString();

expectTypeOf(Facts).toBeObject();
expectTypeOf(Facts.setUserIdFilter).toBeFunction();
expectTypeOf(Facts.setUserIdFilter).returns.toBeVoid();
expectTypeOf(Facts.incrementServerFact).parameters.toEqualTypeOf<[string, string, number]>();
expectTypeOf(Facts.resetServerFacts).returns.toBeVoid();
