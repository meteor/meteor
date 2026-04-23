import { expectTypeOf } from "expect-type";
import { BrowserPolicy } from "./browser-policy-common";

expectTypeOf(BrowserPolicy).toBeObject();
expectTypeOf(BrowserPolicy.framing).toBeObject();
expectTypeOf(BrowserPolicy.content).toBeObject();
