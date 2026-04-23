import { expectTypeOf } from "expect-type";
import { onPageLoad } from "./server-render";
import type {
  Content,
  ClientSink,
  CategorizedRequest,
  ServerSink,
  Sink,
  Callback,
} from "./server-render";

expectTypeOf<Content>().not.toBeNever();
expectTypeOf<ClientSink>().toBeObject();
expectTypeOf<CategorizedRequest>().toBeObject();
expectTypeOf<ServerSink>().toBeObject();
expectTypeOf<Sink>().not.toBeNever();
expectTypeOf<Callback>().toBeFunction();
expectTypeOf(onPageLoad).toBeFunction();
