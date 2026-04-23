import { expectTypeOf } from "expect-type";
import { WebApp, WebAppInternals } from "./webapp";
import type { StaticFiles } from "./webapp";

expectTypeOf<StaticFiles>().toBeObject();
expectTypeOf(WebApp).toBeObject();
expectTypeOf(WebAppInternals).toBeObject();
