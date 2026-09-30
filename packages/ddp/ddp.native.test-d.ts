import { expectTypeOf } from "expect-type";
import { DDP, DDPServer, DDPCommon } from "./ddp.native";
import { DDP as ClientDDP } from "meteor/ddp-client";
import { DDPCommon as CommonDDP } from "meteor/ddp-common";
import { DDPServer as ServerDDP } from "meteor/ddp-server";

// The aggregate entry must retain the package-owned declarations.
expectTypeOf(DDP).toEqualTypeOf<typeof ClientDDP>();
expectTypeOf(DDPCommon).toEqualTypeOf<typeof CommonDDP>();
expectTypeOf(DDPServer).toEqualTypeOf<typeof ServerDDP>();

expectTypeOf(DDPServer).toBeObject();
expectTypeOf<DDPServer.PublicationStrategy>().toBeObject();
expectTypeOf(DDPServer.publicationStrategies).toBeObject();
