import { expectTypeOf } from "expect-type";
import { DDPServer } from "./ddp-server";

// --- DDPServer namespace ---
expectTypeOf(DDPServer).toBeObject();

// --- PublicationStrategy ---
expectTypeOf<DDPServer.PublicationStrategy>().toBeObject();
expectTypeOf<DDPServer.PublicationStrategy["useDummyDocumentView"]>().toEqualTypeOf<boolean>();
expectTypeOf<DDPServer.PublicationStrategy["useCollectionView"]>().toEqualTypeOf<boolean>();
expectTypeOf<DDPServer.PublicationStrategy["doAccountingForCollection"]>().toEqualTypeOf<boolean>();

// --- publicationStrategies ---
expectTypeOf(DDPServer.publicationStrategies).toBeObject();
expectTypeOf(DDPServer.publicationStrategies.SERVER_MERGE).toEqualTypeOf<DDPServer.PublicationStrategy>();
expectTypeOf(DDPServer.publicationStrategies.NO_MERGE_NO_HISTORY).toEqualTypeOf<DDPServer.PublicationStrategy>();
expectTypeOf(DDPServer.publicationStrategies.NO_MERGE).toEqualTypeOf<DDPServer.PublicationStrategy>();
expectTypeOf(DDPServer.publicationStrategies.NO_MERGE_MULTI).toEqualTypeOf<DDPServer.PublicationStrategy>();
