import { expectTypeOf } from "expect-type";
import { module } from "./hot-module-replacement.native";
import type { Module } from "./hot-module-replacement.native";

expectTypeOf<Module>().toBeObject();
expectTypeOf(module).toBeObject();
expectTypeOf(module).toMatchTypeOf<NodeJS.Module>();
