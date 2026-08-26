import { expectTypeOf } from "expect-type";
import { RoutePolicy } from "./routepolicy";

expectTypeOf(RoutePolicy).toBeObject();

// urlPrefixTypes map
expectTypeOf(RoutePolicy.urlPrefixTypes).toEqualTypeOf<
  Record<string, "network" | "static-online">
>();

// urlPrefixMatches
expectTypeOf(RoutePolicy.urlPrefixMatches).parameters.toEqualTypeOf<
  [string, string]
>();
expectTypeOf(RoutePolicy.urlPrefixMatches).returns.toBeBoolean();

// checkType
expectTypeOf(RoutePolicy.checkType).parameters.toEqualTypeOf<[string]>();
expectTypeOf(RoutePolicy.checkType).returns.toEqualTypeOf<string | null>();

// checkUrlPrefix
expectTypeOf(RoutePolicy.checkUrlPrefix).parameters.toEqualTypeOf<
  [string, "network" | "static-online"]
>();
expectTypeOf(RoutePolicy.checkUrlPrefix).returns.toEqualTypeOf<string | null>();

// checkForConflictWithStatic
expectTypeOf(RoutePolicy.checkForConflictWithStatic).parameters.toEqualTypeOf<
  [
    string,
    "network" | "static-online",
    Array<{ type: string; where: string; url: string }>?,
  ]
>();
expectTypeOf(RoutePolicy.checkForConflictWithStatic).returns.toEqualTypeOf<
  string | null
>();

// declare
expectTypeOf(RoutePolicy.declare).parameters.toEqualTypeOf<
  [string, "network" | "static-online"]
>();
expectTypeOf(RoutePolicy.declare).returns.toBeVoid();

// isValidUrl
expectTypeOf(RoutePolicy.isValidUrl).parameters.toEqualTypeOf<[string]>();
expectTypeOf(RoutePolicy.isValidUrl).returns.toBeBoolean();

// classify
expectTypeOf(RoutePolicy.classify).parameters.toEqualTypeOf<[string]>();
expectTypeOf(RoutePolicy.classify).returns.toEqualTypeOf<
  "network" | "static-online" | null
>();

// urlPrefixesFor
expectTypeOf(RoutePolicy.urlPrefixesFor).parameters.toEqualTypeOf<
  ["network" | "static-online"]
>();
expectTypeOf(RoutePolicy.urlPrefixesFor).returns.toEqualTypeOf<string[]>();
