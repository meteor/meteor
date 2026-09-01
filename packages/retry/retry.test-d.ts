import { expectTypeOf } from "expect-type";
import { Retry, type RetryOptions } from "./retry";

expectTypeOf<RetryOptions>().toEqualTypeOf<{
  baseTimeout?: number;
  exponent?: number;
  maxTimeout?: number;
  minTimeout?: number;
  minCount?: number;
  fuzz?: number;
}>();

const r = new Retry();
expectTypeOf(r).toEqualTypeOf<Retry>();
expectTypeOf(r.baseTimeout).toBeNumber();
expectTypeOf(r.retryTimer).toEqualTypeOf<number | null>();
expectTypeOf(r.clear).returns.toBeVoid();
expectTypeOf(r._timeout).parameters.toEqualTypeOf<[number]>();
expectTypeOf(r._timeout).returns.toBeNumber();
expectTypeOf(r.retryLater).parameters.toEqualTypeOf<[number, () => void]>();
expectTypeOf(r.retryLater).returns.toBeNumber();

expectTypeOf<ConstructorParameters<typeof Retry>>().toEqualTypeOf<[RetryOptions?]>();
