import { expectTypeOf } from "expect-type";
import { OAuthEncryption } from "./oauth-encryption";

expectTypeOf(OAuthEncryption).toBeObject();

expectTypeOf(OAuthEncryption.loadKey).parameters.toEqualTypeOf<[string | null]>();
expectTypeOf(OAuthEncryption.keyIsLoaded).returns.toBeBoolean();
expectTypeOf(OAuthEncryption.seal).parameters.toEqualTypeOf<[unknown, string]>();
// seal returns the sealed object, not a string
expectTypeOf(OAuthEncryption.seal).returns.toEqualTypeOf<OAuthEncryption.SealedValue>();
expectTypeOf<OAuthEncryption.SealedValue>().toEqualTypeOf<{
  iv: string;
  ciphertext: string;
  algorithm: string;
  authTag: string;
}>();
// open takes the sealed object (not a string) as its first argument
expectTypeOf(OAuthEncryption.open).parameters.toEqualTypeOf<[OAuthEncryption.SealedValue, string]>();
expectTypeOf(OAuthEncryption.isSealed).returns.toBeBoolean();
