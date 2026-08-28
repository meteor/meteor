import { expectTypeOf } from "expect-type";
import {
  isModern,
  setMinimumBrowserVersions,
  getMinimumBrowserVersions,
  calculateHashOfMinimumVersions,
} from "./modern";

// isModern
expectTypeOf(isModern).parameters.toEqualTypeOf<
  [{ name: string; major: number; minor?: number; patch?: number }]
>();
expectTypeOf(isModern).returns.toBeBoolean();
expectTypeOf(isModern({ name: "chrome", major: 120 })).toBeBoolean();
expectTypeOf(isModern({ name: "chrome", major: 120, minor: 0, patch: 1 })).toBeBoolean();

// setMinimumBrowserVersions
expectTypeOf(setMinimumBrowserVersions).parameters.toEqualTypeOf<
  [Record<string, number | number[]>, string?]
>();
expectTypeOf(setMinimumBrowserVersions).returns.toBeVoid();
expectTypeOf(setMinimumBrowserVersions({ chrome: 80 })).toBeVoid();
expectTypeOf(
  setMinimumBrowserVersions({ chrome: [80, 0, 0] }, "my-feature"),
).toBeVoid();

// getMinimumBrowserVersions
expectTypeOf(getMinimumBrowserVersions).parameters.toEqualTypeOf<[]>();
expectTypeOf(getMinimumBrowserVersions).returns.toEqualTypeOf<
  Record<string, { version: number | number[]; source: string }>
>();

// calculateHashOfMinimumVersions
expectTypeOf(calculateHashOfMinimumVersions).parameters.toEqualTypeOf<[]>();
expectTypeOf(calculateHashOfMinimumVersions).returns.toBeString();
