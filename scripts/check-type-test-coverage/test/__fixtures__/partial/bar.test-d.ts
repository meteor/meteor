import type { Covered } from "./bar";

declare function expectTypeOf<T>(value?: T): void;

expectTypeOf<Covered>();
