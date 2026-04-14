import { expectTypeOf } from "expect-type";
import { ReactiveDict } from "./reactive-dict";

type Shape = { count: number; name: string; active: boolean };

expectTypeOf<typeof ReactiveDict>().toBeConstructibleWith();
expectTypeOf<typeof ReactiveDict>().toBeConstructibleWith("dictName");
expectTypeOf<typeof ReactiveDict>().toBeConstructibleWith("dictName", { count: 0 });

const dict = new ReactiveDict<Shape>("d", { count: 0 });
expectTypeOf(dict).toEqualTypeOf<ReactiveDict<Shape>>();

expectTypeOf(dict.setDefault).toBeFunction();
expectTypeOf(dict.set).toBeFunction();
dict.set("count", 1);
dict.set({ name: "x" });
dict.setDefault("active", true);
dict.setDefault({ count: 0 });

expectTypeOf(dict.get<"count">).parameters.toEqualTypeOf<["count"]>();
expectTypeOf(dict.get<"count">).returns.toEqualTypeOf<number | undefined>();
expectTypeOf(dict.get<"name">).returns.toEqualTypeOf<string | undefined>();

expectTypeOf(dict.equals).toBeFunction();
expectTypeOf(dict.equals<"count">).parameters.toEqualTypeOf<
  ["count", string | number | boolean | undefined | null]
>();
expectTypeOf(dict.equals<"count">).returns.toBeBoolean();

expectTypeOf(dict.all).returns.toEqualTypeOf<Partial<Shape>>();
expectTypeOf(dict.clear).returns.toBeVoid();

expectTypeOf(dict.delete<"count">).parameters.toEqualTypeOf<["count"]>();
expectTypeOf(dict.delete<"count">).returns.toBeBoolean();

expectTypeOf(dict.destroy).returns.toBeVoid();
