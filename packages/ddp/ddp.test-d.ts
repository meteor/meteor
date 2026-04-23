import { expectTypeOf } from "expect-type";
import { DDP } from "./ddp";
import type { DDPCommon } from "./ddp";

expectTypeOf(DDP).toBeObject();
expectTypeOf<DDPCommon.MethodInvocation>().toBeObject();
