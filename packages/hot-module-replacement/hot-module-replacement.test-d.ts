import { expectTypeOf } from "expect-type";
import { module } from "./hot-module-replacement";
import type { Module } from "./hot-module-replacement";

expectTypeOf<Module>().toBeObject();
expectTypeOf(module).toBeObject();
