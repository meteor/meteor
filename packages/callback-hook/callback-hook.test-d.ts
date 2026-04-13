import { expectTypeOf } from "expect-type";
import { Hook, type HookOptions, type HookRegistration } from "./callback-hook";

expectTypeOf<HookOptions>().toEqualTypeOf<{
  bindEnvironment?: boolean;
  wrapAsync?: boolean;
  exceptionHandler?: (exception: Error) => void;
  debugPrintExceptions?: string;
}>();

type Cb = (a: number, b: string) => boolean;

const hook = new Hook<Cb>();
expectTypeOf(hook).toEqualTypeOf<Hook<Cb>>();

const reg = hook.register((a, b) => a > 0 && b.length > 0);
expectTypeOf(reg).toEqualTypeOf<HookRegistration<Cb>>();
expectTypeOf(reg.callback).toEqualTypeOf<Cb>();
expectTypeOf(reg.stop).toEqualTypeOf<() => void>();

expectTypeOf(hook.clear).returns.toBeVoid();
expectTypeOf(hook.forEach).parameters.toEqualTypeOf<[(callback: Cb) => boolean | void]>();
expectTypeOf(hook.forEach).returns.toBeVoid();
expectTypeOf(hook.forEachAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(hook.each).parameters.toEqualTypeOf<[(callback: Cb) => boolean | void]>();
