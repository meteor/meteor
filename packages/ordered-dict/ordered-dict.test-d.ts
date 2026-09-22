import { expectTypeOf } from "expect-type";
import { OrderedDict } from "./ordered-dict";

expectTypeOf(OrderedDict.BREAK).toEqualTypeOf<{ break: true }>();

expectTypeOf<typeof OrderedDict>().toBeConstructibleWith();
expectTypeOf<typeof OrderedDict>().toBeConstructibleWith((k: unknown) => String(k));

const dict = new OrderedDict<string, number>((k) => k, ["a", 1], ["b", 2]);
expectTypeOf(dict).toEqualTypeOf<OrderedDict<string, number>>();

expectTypeOf(dict.empty).returns.toBeBoolean();
expectTypeOf(dict.size).returns.toBeNumber();

expectTypeOf(dict.putBefore).parameters.toEqualTypeOf<[string, number, string | null]>();
expectTypeOf(dict.putBefore).returns.toBeVoid();

expectTypeOf(dict.append).parameters.toEqualTypeOf<[string, number]>();
expectTypeOf(dict.append).returns.toBeVoid();

expectTypeOf(dict.remove).parameters.toEqualTypeOf<[string]>();
expectTypeOf(dict.remove).returns.toBeNumber();

expectTypeOf(dict.get).parameters.toEqualTypeOf<[string]>();
expectTypeOf(dict.get).returns.toEqualTypeOf<number | undefined>();

expectTypeOf(dict.has).parameters.toEqualTypeOf<[string]>();
expectTypeOf(dict.has).returns.toBeBoolean();

expectTypeOf(dict.forEach).returns.toBeVoid();
expectTypeOf(dict.forEachAsync).returns.resolves.toBeVoid();

expectTypeOf(dict.first).returns.toEqualTypeOf<string | undefined>();
expectTypeOf(dict.firstValue).returns.toEqualTypeOf<number | undefined>();
expectTypeOf(dict.last).returns.toEqualTypeOf<string | undefined>();
expectTypeOf(dict.lastValue).returns.toEqualTypeOf<number | undefined>();

expectTypeOf(dict.prev).parameters.toEqualTypeOf<[string]>();
expectTypeOf(dict.prev).returns.toEqualTypeOf<string | null>();

expectTypeOf(dict.next).parameters.toEqualTypeOf<[string]>();
expectTypeOf(dict.next).returns.toEqualTypeOf<string | null>();

expectTypeOf(dict.moveBefore).parameters.toEqualTypeOf<[string, string | null]>();
expectTypeOf(dict.moveBefore).returns.toBeVoid();

expectTypeOf(dict.indexOf).parameters.toEqualTypeOf<[string]>();
expectTypeOf(dict.indexOf).returns.toEqualTypeOf<number | null>();
