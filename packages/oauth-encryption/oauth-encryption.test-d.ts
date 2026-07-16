import { expectTypeOf } from "expect-type";
import { OAuthEncryption } from "./oauth-encryption";

expectTypeOf(OAuthEncryption).toBeObject();

expectTypeOf(OAuthEncryption.loadKey).parameters.toEqualTypeOf<[string | null]>();
expectTypeOf(OAuthEncryption.keyIsLoaded).returns.toBeBoolean();
expectTypeOf(OAuthEncryption.seal).parameters.toEqualTypeOf<[unknown, string]>();
expectTypeOf(OAuthEncryption.seal).returns.toBeString();
expectTypeOf(OAuthEncryption.open).parameters.toEqualTypeOf<[string, string]>();
expectTypeOf(OAuthEncryption.isSealed).returns.toBeBoolean();
