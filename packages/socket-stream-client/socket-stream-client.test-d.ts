import { expectTypeOf } from "expect-type";
import { ClientStream } from "./socket-stream-client";

expectTypeOf<ClientStream>().toBeObject();

const stream = new ClientStream("ws://localhost:3000/websocket");
expectTypeOf(stream.send).parameters.toEqualTypeOf<[string]>();
expectTypeOf(stream.send).returns.toBeVoid();
expectTypeOf(stream.on).toBeFunction();
expectTypeOf(stream.reconnect).toBeFunction();
expectTypeOf(stream.disconnect).toBeFunction();
expectTypeOf(stream.status).returns.toBeObject();
