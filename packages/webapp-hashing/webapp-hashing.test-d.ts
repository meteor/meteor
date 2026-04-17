import { expectTypeOf } from "expect-type";
import { WebAppHashing } from "./webapp-hashing";

expectTypeOf(WebAppHashing).toBeObject();

// calculateClientHash
expectTypeOf(WebAppHashing.calculateClientHash).parameter(0).toEqualTypeOf<
  Array<{
    type: string;
    where: string;
    path: string;
    hash: string;
    url?: string;
    replaceable?: boolean;
  }>
>();
expectTypeOf(WebAppHashing.calculateClientHash).parameter(1).toEqualTypeOf<
  ((type: string, replaceable?: boolean) => boolean) | undefined
>();
expectTypeOf(WebAppHashing.calculateClientHash).parameter(2).toEqualTypeOf<
  Record<string, unknown> | undefined
>();
expectTypeOf(WebAppHashing.calculateClientHash).returns.toBeString();

// calculateCordovaCompatibilityHash
expectTypeOf(WebAppHashing.calculateCordovaCompatibilityHash).parameters.toEqualTypeOf<
  [string, Record<string, string>]
>();
expectTypeOf(WebAppHashing.calculateCordovaCompatibilityHash).returns.toBeString();

// Smoke usage
expectTypeOf(
  WebAppHashing.calculateClientHash(
    [{ type: "js", where: "client", path: "/a.js", hash: "abc" }],
    (type, replaceable) => type === "js" && !replaceable,
    { version: "1" },
  ),
).toBeString();
