import { expectTypeOf } from "expect-type";
import { Tracker } from "./tracker";

expectTypeOf(Tracker).toBeObject();

// Globals on the namespace
expectTypeOf(Tracker.active).toBeBoolean();
expectTypeOf(Tracker.currentComputation).toEqualTypeOf<Tracker.Computation | null>();
expectTypeOf(Tracker.Dependency).toEqualTypeOf<Tracker.DependencyStatic>();

// autorun
expectTypeOf(Tracker.autorun).parameter(0).toEqualTypeOf<
  (computation: Tracker.Computation) => void
>();
expectTypeOf(Tracker.autorun).parameter(1).toEqualTypeOf<
  { onError?: ((error: unknown) => void) | undefined } | undefined
>();
expectTypeOf(Tracker.autorun).returns.toEqualTypeOf<Tracker.Computation>();

// afterFlush / flush
expectTypeOf(Tracker.afterFlush).parameters.toEqualTypeOf<[() => void]>();
expectTypeOf(Tracker.afterFlush).returns.toBeVoid();
expectTypeOf(Tracker.flush).parameters.toEqualTypeOf<[]>();
expectTypeOf(Tracker.flush).returns.toBeVoid();

// nonreactive preserves return type
expectTypeOf(Tracker.nonreactive).toBeFunction();
expectTypeOf(Tracker.nonreactive<number>).returns.toBeNumber();
expectTypeOf(Tracker.nonreactive<string>).returns.toBeString();

// withComputation
expectTypeOf(Tracker.withComputation).toBeFunction();
expectTypeOf(Tracker.withComputation<number>).parameters.toEqualTypeOf<
  [Tracker.Computation | null, () => number]
>();
expectTypeOf(Tracker.withComputation<number>).returns.toEqualTypeOf<number>();

// onInvalidate (top-level)
expectTypeOf(Tracker.onInvalidate).parameters.toEqualTypeOf<
  [(computation: Tracker.Computation) => void]
>();
expectTypeOf(Tracker.onInvalidate).returns.toBeVoid();

// Computation interface
expectTypeOf<Tracker.Computation>().toHaveProperty("firstRun").toBeBoolean();
expectTypeOf<Tracker.Computation>().toHaveProperty("firstRunPromise").toEqualTypeOf<Promise<unknown> | undefined>();
expectTypeOf<Tracker.Computation>().toHaveProperty("invalidated").toBeBoolean();
expectTypeOf<Tracker.Computation>().toHaveProperty("stopped").toBeBoolean();
expectTypeOf<Tracker.Computation["invalidate"]>().toEqualTypeOf<() => void>();
expectTypeOf<Tracker.Computation["stop"]>().toEqualTypeOf<() => void>();
expectTypeOf<Tracker.Computation["onInvalidate"]>().parameters.toEqualTypeOf<
  [(computation: Tracker.Computation) => void]
>();
expectTypeOf<Tracker.Computation["onStop"]>().parameters.toEqualTypeOf<
  [(computation: Tracker.Computation) => void]
>();

// Dependency interface + static
expectTypeOf<Tracker.DependencyStatic>().toBeConstructibleWith();
expectTypeOf<Tracker.Dependency["changed"]>().toEqualTypeOf<() => void>();
expectTypeOf<Tracker.Dependency["depend"]>().parameters.toEqualTypeOf<
  [Tracker.Computation?]
>();
expectTypeOf<Tracker.Dependency["depend"]>().returns.toBeBoolean();
expectTypeOf<Tracker.Dependency["hasDependents"]>().returns.toBeBoolean();

expectTypeOf(Tracker.inFlush).returns.toBeBoolean();
