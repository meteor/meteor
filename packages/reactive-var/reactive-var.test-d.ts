import { expectTypeOf } from "expect-type";
import type { ReactiveVar, ReactiveVarStatic } from "./reactive-var";
import { ReactiveVar as ReactiveVarValue } from "./reactive-var";

// ReactiveVarStatic — the constructor interface
declare const ctor: ReactiveVarStatic;
expectTypeOf(ctor).toBeObject();
expectTypeOf(new ctor<number>(0)).toEqualTypeOf<ReactiveVar<number>>();
expectTypeOf(new ctor<string>("x", (a, b) => a === b)).toEqualTypeOf<ReactiveVar<string>>();

// ReactiveVar<T> — the instance interface
declare const rv: ReactiveVar<number>;
expectTypeOf(rv).toMatchTypeOf<{ get(): number; set(v: number): void }>();
expectTypeOf(rv.get()).toBeNumber();
expectTypeOf(rv.set).parameter(0).toBeNumber();
expectTypeOf(rv.set).returns.toBeVoid();

// ReactiveVar runtime value — exported `var` typed as ReactiveVarStatic
expectTypeOf(ReactiveVarValue).toEqualTypeOf<ReactiveVarStatic>();
