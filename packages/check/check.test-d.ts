import { expectTypeOf } from "expect-type";
import { check, Match } from "./check";

expectTypeOf(Match).toBeObject();

// Match.Any / Integer / NonEmptyString
expectTypeOf(Match.Any).toEqualTypeOf<Match.Matcher<any>>();
expectTypeOf(Match.Integer).toEqualTypeOf<Match.Matcher<number>>();
expectTypeOf(Match.NonEmptyString).toEqualTypeOf<Match.Matcher<string>>();

// PatternMatch inference
expectTypeOf<Match.PatternMatch<typeof String>>().toBeString();
expectTypeOf<Match.PatternMatch<typeof Number>>().toBeNumber();
expectTypeOf<Match.PatternMatch<typeof Boolean>>().toBeBoolean();
expectTypeOf<Match.PatternMatch<null>>().toBeNull();
expectTypeOf<Match.PatternMatch<"foo">>().toEqualTypeOf<"foo">();
expectTypeOf<Match.PatternMatch<[typeof Number]>>().toEqualTypeOf<number[]>();
expectTypeOf<
  Match.PatternMatch<{ name: typeof String; age: typeof Number }>
>().toEqualTypeOf<{ name: string; age: number }>();

// Pattern union covers primitives / constructors / arrays / objects / Matchers
expectTypeOf<Match.Pattern>().toEqualTypeOf<Match.Pattern>();
expectTypeOf<"literal">().toMatchTypeOf<Match.Pattern>();
expectTypeOf<[typeof Number]>().toMatchTypeOf<Match.Pattern>();
expectTypeOf<{ k: typeof String }>().toMatchTypeOf<Match.Pattern>();
expectTypeOf<typeof String>().toMatchTypeOf<Match.Pattern>();
expectTypeOf<null>().toMatchTypeOf<Match.Pattern>();

// Match.Maybe / Optional / ObjectIncluding / OneOf / Where
expectTypeOf(Match.Maybe(String)).toEqualTypeOf<
  Match.Matcher<string | undefined | null>
>();
expectTypeOf(Match.Optional(Number)).toEqualTypeOf<
  Match.Matcher<number | undefined>
>();
expectTypeOf(Match.ObjectIncluding({ a: String })).toEqualTypeOf<
  Match.Matcher<{ a: string }>
>();
expectTypeOf(Match.OneOf(String, Number)).toEqualTypeOf<
  Match.Matcher<string | number>
>();
expectTypeOf(Match.Where<string>((v): v is string => typeof v === "string"))
  .toEqualTypeOf<Match.Matcher<string>>();
expectTypeOf(Match.Where((v) => !!v)).toEqualTypeOf<Match.Matcher<unknown>>();

// Bare references for Maybe / Optional / ObjectIncluding / OneOf / Where
expectTypeOf(Match.Maybe).toBeFunction();
expectTypeOf(Match.Optional).toBeFunction();
expectTypeOf(Match.ObjectIncluding).toBeFunction();
expectTypeOf(Match.OneOf).toBeFunction();
expectTypeOf(Match.Where).toBeFunction();

// Match.test
const val: unknown = 0;
if (Match.test(val, String)) {
  expectTypeOf(val).toBeString();
}
expectTypeOf(Match.test).returns.toBeBoolean();

// check (assertion function)
const unknownVal: unknown = null;
check(unknownVal, Number);
expectTypeOf(unknownVal).toBeNumber();
expectTypeOf(check).parameter(2).toEqualTypeOf<
  { throwAllErrors?: boolean } | undefined
>();
