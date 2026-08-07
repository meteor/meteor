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

// --- WebApp functions ---
expectTypeOf(WebApp.suppressConnectErrors).toBeFunction();
expectTypeOf(WebApp.onListening).toBeFunction();
expectTypeOf(WebApp.addRuntimeConfigHook).toBeFunction();
expectTypeOf(WebApp.decodeRuntimeConfig).toBeFunction();
expectTypeOf(WebApp.encodeRuntimeConfig).toBeFunction();
expectTypeOf(WebApp.addHtmlAttributeHook).toBeFunction();

// --- WebApp types ---
expectTypeOf<WebApp.RuntimeConfigHookCallback>().toBeFunction();

// --- WebAppInternals consts ---
expectTypeOf(WebAppInternals.NpmModules).toBeObject();
expectTypeOf(WebAppInternals.staticFiles).toBeObject();
expectTypeOf(WebAppInternals.additionalStaticJs).toBeObject();

// --- WebAppInternals functions ---
expectTypeOf(WebAppInternals.identifyBrowser).toBeFunction();
expectTypeOf(WebAppInternals.registerBoilerplateDataCallback).toBeFunction();
expectTypeOf(WebAppInternals.generateBoilerplateInstance).toBeFunction();
expectTypeOf(WebAppInternals.staticFilesMiddleware).toBeFunction();
expectTypeOf(WebAppInternals.parsePort).toBeFunction();
expectTypeOf(WebAppInternals.reloadClientPrograms).toBeFunction();
expectTypeOf(WebAppInternals.generateBoilerplate).toBeFunction();
expectTypeOf(WebAppInternals.inlineScriptsAllowed).toBeFunction();
expectTypeOf(WebAppInternals.setInlineScriptsAllowed).toBeFunction();
expectTypeOf(WebAppInternals.setBundledJsCssUrlRewriteHook).toBeFunction();
expectTypeOf(WebAppInternals.setBundledJsCssPrefix).toBeFunction();
expectTypeOf(WebAppInternals.addStaticJs).toBeFunction();
expectTypeOf(WebAppInternals.getBoilerplate).toBeFunction();
