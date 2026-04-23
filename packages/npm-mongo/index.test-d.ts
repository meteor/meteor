import { expectTypeOf } from "expect-type";
import { NpmModuleMongodb, NpmModuleMongodbVersion } from "./index";

expectTypeOf(NpmModuleMongodb).toBeObject();
expectTypeOf(NpmModuleMongodbVersion).toBeString();
