import { expectTypeOf } from "expect-type";
import { WebApp, WebAppInternals } from "./webapp";
import type { StaticFiles } from "./webapp";

expectTypeOf<StaticFiles>().toBeObject();
expectTypeOf(WebApp).toBeObject();
expectTypeOf(WebAppInternals).toBeObject();

// --- WebApp consts ---
expectTypeOf(WebApp.defaultArch).toBeString();
expectTypeOf(WebApp.clientPrograms).toBeObject();
// These are typed `express.Application`, which surfaces as `any` under the repo's
// type setup — so a structural matcher can't be applied. `.toBeAny()` documents that
// (and will fail loudly if the express handler typings are ever tightened).
expectTypeOf(WebApp.connectHandlers).toBeAny();
expectTypeOf(WebApp.handlers).toBeAny();
expectTypeOf(WebApp.rawConnectHandlers).toBeAny();
expectTypeOf(WebApp.rawHandlers).toBeAny();
expectTypeOf(WebApp.httpServer).toBeObject();
expectTypeOf(WebApp.expressApp).toBeAny();
expectTypeOf(WebApp.express).toBeFunction();

// --- WebApp functions (exact return types) ---
expectTypeOf(WebApp.suppressConnectErrors).returns.toBeVoid();
expectTypeOf(WebApp.onListening).returns.toBeVoid();
expectTypeOf(WebApp.addRuntimeConfigHook).returns.toMatchTypeOf<{ stop: () => void }>();
expectTypeOf(WebApp.decodeRuntimeConfig).returns.toEqualTypeOf<unknown>();
expectTypeOf(WebApp.encodeRuntimeConfig).returns.toEqualTypeOf<string>();
expectTypeOf(WebApp.addHtmlAttributeHook).returns.toBeVoid();

// --- WebApp types ---
expectTypeOf<WebApp.RuntimeConfigHookCallback>().toBeFunction();

// --- WebAppInternals consts ---
expectTypeOf(WebAppInternals.NpmModules).toBeObject();
expectTypeOf(WebAppInternals.staticFiles).toBeObject();
expectTypeOf(WebAppInternals.additionalStaticJs).toBeObject();

// --- WebAppInternals functions (exact return types) ---
expectTypeOf(WebAppInternals.identifyBrowser).returns.toEqualTypeOf<{
  name: string;
  major: number;
  minor: number;
  patch: number;
}>();
expectTypeOf(WebAppInternals.registerBoilerplateDataCallback).toBeFunction();
expectTypeOf(WebAppInternals.generateBoilerplateInstance).toBeFunction();
expectTypeOf(WebAppInternals.staticFilesMiddleware).returns.toBeVoid();
expectTypeOf(WebAppInternals.parsePort).returns.toEqualTypeOf<string | number>();
expectTypeOf(WebAppInternals.reloadClientPrograms).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(WebAppInternals.generateBoilerplate).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(WebAppInternals.inlineScriptsAllowed).returns.toEqualTypeOf<boolean>();
expectTypeOf(WebAppInternals.setInlineScriptsAllowed).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(WebAppInternals.setBundledJsCssUrlRewriteHook).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(WebAppInternals.setBundledJsCssPrefix).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(WebAppInternals.addStaticJs).returns.toBeVoid();
expectTypeOf(WebAppInternals.getBoilerplate).toBeFunction();
