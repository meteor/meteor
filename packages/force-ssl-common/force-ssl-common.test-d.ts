import { expectTypeOf } from "expect-type";
import { isLocalConnection, isSslConnection } from "./force-ssl-common";

expectTypeOf(isLocalConnection).toBeFunction();
expectTypeOf(isLocalConnection).returns.toBeBoolean();

expectTypeOf(isSslConnection).toBeFunction();
expectTypeOf(isSslConnection).returns.toBeBoolean();
