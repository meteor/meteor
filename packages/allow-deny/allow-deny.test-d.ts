import { expectTypeOf } from "expect-type";
import { AllowDeny } from "./allow-deny";

expectTypeOf(AllowDeny).toBeObject();
expectTypeOf(AllowDeny.CollectionPrototype).toBeObject();
expectTypeOf(AllowDeny.CollectionPrototype.allow).returns.toBeVoid();
expectTypeOf(AllowDeny.CollectionPrototype.deny).returns.toBeVoid();
expectTypeOf(AllowDeny.CollectionPrototype._defineMutationMethods).returns.toBeVoid();
expectTypeOf(AllowDeny.CollectionPrototype._isInsecure).returns.toBeBoolean();
