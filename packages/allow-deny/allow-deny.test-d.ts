import { expectTypeOf } from "expect-type";
import { AllowDeny } from "./allow-deny";

expectTypeOf(AllowDeny).toBeObject();
expectTypeOf(AllowDeny.CollectionPrototype).toBeObject();
expectTypeOf(AllowDeny.CollectionPrototype.allow).returns.toBeBoolean();
expectTypeOf(AllowDeny.CollectionPrototype.deny).returns.toBeBoolean();
expectTypeOf(AllowDeny.CollectionPrototype._defineMutationMethods).returns.toBeVoid();
expectTypeOf(AllowDeny.CollectionPrototype._isInsecure).returns.toBeBoolean();
