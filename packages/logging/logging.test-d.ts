import { expectTypeOf } from "expect-type";
import { Log } from "./logging";

// Log is both a callable function and a namespace with statics/helpers
expectTypeOf(Log).toBeFunction();
expectTypeOf(Log).parameter(0).toEqualTypeOf<
  | string
  | {
      message: string;
      app?: string;
      [index: string]: string | object | number | undefined;
    }
>();
expectTypeOf(Log).returns.toBeVoid();

// Accepts string or json-like input
expectTypeOf(Log("hello")).toBeVoid();
expectTypeOf(Log({ message: "ok", app: "api" })).toBeVoid();

// Output format / showTime globals
expectTypeOf(Log.outputFormat).toEqualTypeOf<"json" | "colored-text">();
expectTypeOf(Log.showTime).toBeBoolean();

// Interception helpers
expectTypeOf(Log._intercept).parameters.toEqualTypeOf<[number]>();
expectTypeOf(Log._intercept).returns.toBeVoid();
expectTypeOf(Log._suppress).parameters.toEqualTypeOf<[number]>();
expectTypeOf(Log._suppress).returns.toBeVoid();
expectTypeOf(Log._intercepted).returns.toEqualTypeOf<string[]>();
expectTypeOf(Log._getCallerDetails).returns.toEqualTypeOf<{
  line?: string;
  file?: string;
}>();

// parse / format / objFromText
expectTypeOf(Log.parse).parameters.toEqualTypeOf<
  [Record<string, unknown> | string]
>();
expectTypeOf(Log.parse).returns.toEqualTypeOf<Record<string, unknown> | null>();

expectTypeOf(Log.format).parameter(1).toEqualTypeOf<{ color?: boolean; metaColor?: string } | undefined>();
expectTypeOf(Log.format).returns.toBeString();

expectTypeOf(Log.objFromText).parameters.toEqualTypeOf<
  [string, Record<string, unknown>]
>();
expectTypeOf(Log.objFromText).returns.toEqualTypeOf<{
  message: string;
  level: "info";
  time: Date;
  timeInexact: true;
}>();

// Level helpers
expectTypeOf(Log.debug).parameter(0).toEqualTypeOf<Parameters<typeof Log>[0]>();
expectTypeOf(Log.debug).returns.toBeVoid();
expectTypeOf(Log.info).returns.toBeVoid();
expectTypeOf(Log.warn).returns.toBeVoid();
expectTypeOf(Log.error).returns.toBeVoid();
