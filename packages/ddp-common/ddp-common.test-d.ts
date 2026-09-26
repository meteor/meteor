import { expectTypeOf } from "expect-type";
import { DDPCommon } from "meteor/ddp-common";
import type { Meteor } from "meteor/meteor";
import type { Random } from "meteor/random";

expectTypeOf(DDPCommon).toBeObject();
expectTypeOf<DDPCommon.MethodInvocation>().toBeObject();
expectTypeOf<DDPCommon.MethodInvocationOptions>().toBeObject();
expectTypeOf<DDPCommon.Heartbeat>().toBeObject();
expectTypeOf<DDPCommon.HeartbeatOptions>().toBeObject();
expectTypeOf<DDPCommon.RandomStream>().toBeObject();
expectTypeOf(DDPCommon.SUPPORTED_DDP_VERSIONS).toEqualTypeOf<string[]>();
expectTypeOf(DDPCommon.parseDDP).toBeFunction();
expectTypeOf(DDPCommon.stringifyDDP).toBeFunction();
expectTypeOf(DDPCommon.makeRpcSeed).toBeFunction();

const invocation = new DDPCommon.MethodInvocation({
  connection: null,
  isSimulation: false,
  name: "parse",
  randomSeed: "seed",
  userId: "user-id",
  async setUserId(userId) {
    expectTypeOf(userId).toEqualTypeOf<string | null>();
  },
});
expectTypeOf(invocation.connection).toEqualTypeOf<Meteor.Connection | null | undefined>();
expectTypeOf(invocation.setUserId(null)).toEqualTypeOf<Promise<void>>();

const stubInvocation = new DDPCommon.MethodInvocation({
  isSimulation: true,
  isFromCallAsync: true,
  userId: null,
  randomSeed: () => "lazy-seed",
});
expectTypeOf(stubInvocation.connection)
  .toEqualTypeOf<Meteor.Connection | null | undefined>();

const serverInvocation = new DDPCommon.MethodInvocation({
  connection: null,
  isSimulation: false,
  userId: null,
  randomSeed: null,
  unblock() {},
  fence: {},
});
expectTypeOf(serverInvocation.unblock()).toBeVoid();

const heartbeat = new DDPCommon.Heartbeat({
  heartbeatInterval: 30_000,
  heartbeatTimeout: 15_000,
  sendPing() {},
  onTimeout() {},
});
expectTypeOf(heartbeat.start()).toBeVoid();
expectTypeOf(heartbeat.messageReceived()).toBeVoid();
expectTypeOf(heartbeat.stop()).toBeVoid();
// @ts-expect-error Heartbeat intervals are numeric milliseconds.
new DDPCommon.Heartbeat({ heartbeatInterval: "30000", heartbeatTimeout: 15000, sendPing() {}, onTimeout() {} });

const seeds: DDPCommon.RandomStreamSeed[] = ["seed", 42, () => "lazy-seed"];
expectTypeOf<DDPCommon.RandomStreamSeed>()
  .toEqualTypeOf<string | number | (() => string | number)>();
const randomStream = new DDPCommon.RandomStream({ seed: seeds });
const scope: DDPCommon.RandomStreamScope = { randomSeed: "seed", randomStream };
expectTypeOf<DDPCommon.RandomStreamScope>()
  .toEqualTypeOf<NonNullable<Parameters<typeof DDPCommon.RandomStream.get>[0]>>();
expectTypeOf(randomStream._sequence("named")).toEqualTypeOf<Random.RandomGenerator>();
expectTypeOf(DDPCommon.RandomStream.get(scope, "named"))
  .toEqualTypeOf<Random.RandomGenerator>();
expectTypeOf(DDPCommon.RandomStream.get(invocation).id()).toBeString();
expectTypeOf(DDPCommon.RandomStream.get(null).hexString(20)).toBeString();
expectTypeOf(DDPCommon.RandomStream.get(undefined).fraction()).toBeNumber();
new DDPCommon.RandomStream({});
new DDPCommon.RandomStream({ seed: null });
new DDPCommon.RandomStream({ seed: () => "lazy-seed" });
// @ts-expect-error Random seeds must be seed values or lazy seed functions.
new DDPCommon.RandomStream({ seed: { invalid: true } });
// @ts-expect-error Cached streams must implement the named-sequence lookup.
DDPCommon.RandomStream.get({ randomStream: {} });

expectTypeOf(DDPCommon.makeRpcSeed(invocation, "method")).toBeString();
expectTypeOf(DDPCommon.makeRpcSeed(null, "method")).toBeString();
expectTypeOf(DDPCommon.makeRpcSeed(undefined, "method")).toBeString();
expectTypeOf(invocation.setUserId("user-id")).toEqualTypeOf<Promise<void>>();

expectTypeOf<DDPCommon.Serializer>().toBeObject();
expectTypeOf(DDPCommon.setSerializer).toBeFunction();
expectTypeOf(DDPCommon.getSerializer).toBeFunction();
expectTypeOf(DDPCommon.createEJSONSerializer).toBeFunction();
expectTypeOf(DDPCommon.toWireMessage).toBeFunction();
expectTypeOf(DDPCommon.fromWireMessage).toBeFunction();

const ejsonSerializer = DDPCommon.createEJSONSerializer();
expectTypeOf(ejsonSerializer).toEqualTypeOf<DDPCommon.Serializer>();
expectTypeOf(ejsonSerializer.wireFormat).toEqualTypeOf<"text">();
expectTypeOf(ejsonSerializer.serialize({ msg: "ping", id: "1" })).toBeString();
expectTypeOf(ejsonSerializer.deserialize('{"msg":"pong","id":"1"}'))
  .toEqualTypeOf<Record<string, unknown>>();
expectTypeOf(DDPCommon.getSerializer()).toEqualTypeOf<DDPCommon.Serializer>();
expectTypeOf(DDPCommon.setSerializer(ejsonSerializer)).toBeVoid();
DDPCommon.setSerializer({
  name: "custom",
  wireFormat: "text",
  serialize: (msg) => JSON.stringify(DDPCommon.toWireMessage(msg)),
  deserialize: (raw) => DDPCommon.fromWireMessage(JSON.parse(raw)),
});
// @ts-expect-error The DDP transports only deliver text frames.
DDPCommon.setSerializer({ ...ejsonSerializer, wireFormat: "binary" });
// @ts-expect-error A serializer must provide serialize() and deserialize().
DDPCommon.setSerializer({ name: "broken", wireFormat: "text" });
expectTypeOf(DDPCommon.toWireMessage({ msg: "changed", fields: { a: undefined } }))
  .toEqualTypeOf<Record<string, unknown>>();
expectTypeOf(DDPCommon.fromWireMessage({ msg: "changed", cleared: ["a"] }))
  .toEqualTypeOf<Record<string, unknown>>();
