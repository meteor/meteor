import { expectTypeOf } from "expect-type";
import { BrowserPolicy } from "./browser-policy-common";

expectTypeOf(BrowserPolicy).toBeObject();
expectTypeOf(BrowserPolicy.framing).toBeObject();
expectTypeOf(BrowserPolicy.content).toBeObject();

expectTypeOf(BrowserPolicy.content.allowInlineScripts).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.disallowInlineScripts).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.disallowAll).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.allowOriginForAll).parameter(0).toEqualTypeOf<string>();
expectTypeOf(BrowserPolicy.content.allowSameOriginForAll).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.allowDataUrlForAll).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.disallowAllContent).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.allowAllContentOrigin).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.allowAllContentDataUrl).returns.toBeVoid();
expectTypeOf(BrowserPolicy.content.allowAllContentSameOrigin).returns.toBeVoid();
