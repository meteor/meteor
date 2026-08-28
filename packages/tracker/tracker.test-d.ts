import { expectTypeOf } from "expect-type";
import { Tracker } from "./tracker";

expectTypeOf(Tracker).toBeObject();

// Globals on the namespace
expectTypeOf(Tracker.active).toBeBoolean();
expectTypeOf(Tracker.currentComputation).toEqualTypeOf<Tracker.Computation | null>();
expectTypeOf(Tracker.Dependency).toEqualTypeOf<Tracker.DependencyStatic>();

// autorun
expectTypeOf(Tracker.autorun).toBeCallableWith(
  (_computation: Tracker.Computation) => {},
  { onError(_error: unknown) {} }
);
declare const legacyAutorun: Function;
declare const legacyOnError: Function;
Tracker.autorun(legacyAutorun, { onError: legacyOnError });
expectTypeOf(Tracker.autorun).returns.toEqualTypeOf<Tracker.Computation>();

// afterFlush / flush
expectTypeOf(Tracker.afterFlush).toBeCallableWith(() => {});
expectTypeOf(Tracker.afterFlush).returns.toBeVoid();
expectTypeOf(Tracker.flush).parameters.toEqualTypeOf<[]>();
expectTypeOf(Tracker.flush).returns.toBeVoid();

// nonreactive preserves return type
expectTypeOf(Tracker.nonreactive).toBeFunction();
expectTypeOf(Tracker.nonreactive<number>).returns.toBeNumber();
expectTypeOf(Tracker.nonreactive<string>).returns.toBeString();

// withComputation
expectTypeOf(Tracker.withComputation).toBeFunction();
expectTypeOf(Tracker.withComputation<number>(null, () => 1)).toBeNumber();

// onInvalidate (top-level)
expectTypeOf(Tracker.onInvalidate).toBeCallableWith(
  (_computation: Tracker.Computation) => {}
);
expectTypeOf(Tracker.onInvalidate).returns.toBeVoid();
Tracker.onInvalidate((current) => {
  expectTypeOf(current).toEqualTypeOf<Tracker.Computation>();
});

// Computation interface
expectTypeOf<Tracker.Computation>().toHaveProperty("firstRun").toBeBoolean();
expectTypeOf<Tracker.Computation>().toHaveProperty("firstRunPromise").toEqualTypeOf<Promise<unknown>>();
expectTypeOf<Tracker.Computation>().toHaveProperty("invalidated").toBeBoolean();
expectTypeOf<Tracker.Computation>().toHaveProperty("stopped").toBeBoolean();
expectTypeOf<Tracker.Computation["invalidate"]>().toEqualTypeOf<() => void>();
expectTypeOf<Tracker.Computation["stop"]>().toEqualTypeOf<() => void>();
declare const computation: Tracker.Computation;
computation.onInvalidate((current) => {
  expectTypeOf(current).toEqualTypeOf<Tracker.Computation>();
});
computation.onStop((current) => {
  expectTypeOf(current).toEqualTypeOf<Tracker.Computation>();
});
expectTypeOf(computation.onInvalidate).toBeCallableWith(
  (_computation: Tracker.Computation) => {}
);
expectTypeOf(computation.onStop).toBeCallableWith(
  (_computation: Tracker.Computation) => {}
);

// Dependency interface + static
expectTypeOf<Tracker.DependencyStatic>().toBeConstructibleWith();
expectTypeOf<Tracker.Dependency["changed"]>().toEqualTypeOf<() => void>();
expectTypeOf<Tracker.Dependency["depend"]>().parameters.toEqualTypeOf<
  [Tracker.Computation?]
>();
expectTypeOf<Tracker.Dependency["depend"]>().returns.toBeBoolean();
expectTypeOf<Tracker.Dependency["hasDependents"]>().returns.toBeBoolean();

expectTypeOf(Tracker.inFlush).returns.toBeBoolean();
