import { expectTypeOf } from "expect-type";
import { BrowserPolicy } from "./browser-policy-common";

expectTypeOf(BrowserPolicy).toBeObject();
expectTypeOf(BrowserPolicy.framing).toBeObject();
expectTypeOf(BrowserPolicy.content).toBeObject();

// The inline-script and reset helpers are async at runtime (setWebAppInlineScripts).
expectTypeOf(BrowserPolicy.content.allowInlineScripts).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(BrowserPolicy.content.disallowInlineScripts).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(BrowserPolicy.content.disallowAll).returns.toEqualTypeOf<Promise<void>>();
// The real "for all directives" setters (not the phantom allowAllContent* names).
expectTypeOf(BrowserPolicy.content.allowOriginForAll).parameter(0).toEqualTypeOf<string>();
expectTypeOf(BrowserPolicy.content.allowSameOriginForAll).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.allowDataUrlForAll).returns.toBeVoid();
// @ts-expect-error disallowAllContent is not a real runtime method (was phantom)
BrowserPolicy.content.disallowAllContent;
// @ts-expect-error allowAllContentOrigin is not a real runtime method (was phantom)
BrowserPolicy.content.allowAllContentOrigin;
