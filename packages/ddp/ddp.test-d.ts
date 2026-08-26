import { expectTypeOf } from "expect-type";
import { DDP, DDPServer, DDPCommon } from "./ddp";

// --- DDP ---
expectTypeOf(DDP).toBeObject();
expectTypeOf<DDP.DDPStatic>().toBeObject();
expectTypeOf<DDP.DDPStatus>().toBeObject();
expectTypeOf<DDP.Status>().toEqualTypeOf<
  "connected" | "connecting" | "failed" | "waiting" | "offline"
>();
expectTypeOf(DDP.connect).toBeFunction();

// --- DDPCommon ---
expectTypeOf<DDPCommon.MethodInvocation>().toBeObject();
expectTypeOf<DDPCommon.MethodInvocationOptions>().toBeObject();
expectTypeOf<DDPCommon.Heartbeat>().toBeObject();
expectTypeOf<DDPCommon.HeartbeatOptions>().toBeObject();
expectTypeOf<DDPCommon.RandomStream>().toBeObject();
expectTypeOf(DDPCommon.SUPPORTED_DDP_VERSIONS).toEqualTypeOf<string[]>();
expectTypeOf(DDPCommon.parseDDP).toBeFunction();
expectTypeOf(DDPCommon.stringifyDDP).toBeFunction();
expectTypeOf(DDPCommon.makeRpcSeed).toBeFunction();

// --- DDPServer ---
expectTypeOf(DDPServer).toBeObject();
expectTypeOf<DDPServer.PublicationStrategy>().toBeObject();
expectTypeOf(DDPServer.publicationStrategies).toBeObject();
