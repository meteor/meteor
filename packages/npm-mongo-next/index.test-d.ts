import { expectTypeOf } from "expect-type";
import { NpmModuleMongodb, NpmModuleMongodbVersion } from "./index";

expectTypeOf(NpmModuleMongodb).not.toBeNever();
expectTypeOf(NpmModuleMongodbVersion).toBeString();
