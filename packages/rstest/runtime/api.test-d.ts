import { expectTypeOf } from "expect-type";
import { __registerTestFileLoader, __setRstestRuntimeFactory } from "./api";

expectTypeOf(__registerTestFileLoader).parameters.toEqualTypeOf<
  [testPath: string, load: () => Promise<unknown>]
>();
expectTypeOf(__registerTestFileLoader).returns.toBeVoid();

expectTypeOf(__setRstestRuntimeFactory).parameters.toEqualTypeOf<
  [factory: (...args: unknown[]) => Promise<unknown>]
>();
expectTypeOf(__setRstestRuntimeFactory).returns.toBeVoid();

// @ts-expect-error test file identifiers must be paths
__registerTestFileLoader(123, async () => ({}));
// @ts-expect-error generated entry loaders must complete asynchronously
__registerTestFileLoader("tests/domain.test.ts", () => ({}));
// @ts-expect-error runtime factories must complete asynchronously
__setRstestRuntimeFactory(() => ({}));
