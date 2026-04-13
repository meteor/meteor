import type { Foo } from "./foo";

declare function expectTypeOf<T>(value?: T): void;

expectTypeOf<Foo>();
