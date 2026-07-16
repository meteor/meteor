import { expectTypeOf } from "expect-type";
import { DDP, DDPServer } from "./ddp";
import type { DDPCommon } from "./ddp";

expectTypeOf(DDP).toBeObject();

expectTypeOf<DDPCommon.MethodInvocation>().toBeObject();
expectTypeOf<DDPCommon.Heartbeat>().toBeObject();
expectTypeOf<DDPCommon.RandomStream>().toBeObject();
expectTypeOf<DDPCommon.HeartbeatOptions>().toBeObject();

expectTypeOf(DDPServer).toBeObject();
expectTypeOf(DDPServer.publicationStrategies).toBeObject();
expectTypeOf(DDPServer.publicationStrategies.SERVER_MERGE.useCollectionView).toBeBoolean();
