import { expectTypeOf } from "expect-type";
import type { ReactiveVar, ReactiveVarStatic } from "./reactive-var";
import { ReactiveVar as ReactiveVarValue } from "./reactive-var";

expectTypeOf<ReactiveVarStatic>().toBeConstructibleWith(0);
expectTypeOf<ReactiveVarStatic>().toBeConstructibleWith("s", (a, b) => a === b);

const rv = new ReactiveVarValue<number>(1);
expectTypeOf(rv).toEqualTypeOf<ReactiveVar<number>>();
expectTypeOf(rv.get).returns.toBeNumber();
expectTypeOf(rv.set).parameters.toEqualTypeOf<[number]>();
expectTypeOf(rv.set).returns.toBeVoid();
